// // src\tasks\tasks.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule';
// import { UsersService } from '../users/users.service';

// @Injectable()
// export class TasksService {
//   // Logger нужен для красивого вывода в консоль
//   private readonly logger = new Logger(TasksService.name);

//   constructor(private readonly usersService: UsersService) {}

//   /**
//    * Эта фоновая задача будет запускаться каждый день в 00:05 (5 минут после полуночи).
//    * Она находит всех пользователей с истекшей премиум-подпиской и меняет их тариф на "Базовый".
//    */
//   @Cron(CronExpression.EVERY_10_SECONDS) // Можно выбрать любое время, например, EVERY_DAY_AT_MIDNIGHT
//   async handleExpiredSubscriptions() {
//     this.logger.log('Запущена проверка истекших премиум-подписок...');

//     try {
//       // Вызываем новый метод в UsersService, который сделает всю работу
//       const deactivatedCount = await this.usersService.deactivateExpiredPremiums();
      
//       if (deactivatedCount > 0) {
//         this.logger.log(`Успешно деактивировано ${deactivatedCount} истекших подписок.`);
//       } else {
//         this.logger.log('Истекших подписок не найдено.');
//       }
//     } catch (error) {
//       this.logger.error('Ошибка при обработке истекших подписок:', error);
//     }
//   }
// }
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule'; // <-- Импортируем Timeout
import { UsersService } from '../users/users.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Этот метод выполнится ОДИН РАЗ через 15 секунд после старта приложения.
   * Это "отложенный" первый запуск, чтобы дать TypeORM время создать таблицы.
   */
  @Timeout(15000) // 15 секунд
  handleInitialCheck() {
    this.logger.log('Выполняется отложенная первоначальная проверка истекших подписок...');
    this.handleExpiredSubscriptions();
  }

  /**
   * Эта фоновая задача будет запускаться КАЖДЫЕ 10 МИНУТ.
   * (Мы увеличиваем интервал, чтобы не спамить в логах).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleExpiredSubscriptions() {
    this.logger.log('Запущена проверка истекших премиум-подписок...');
    
    // Проверяем, что база данных доступна
    try {
      await this.usersService.findOneById(1); // Простая проверка доступности БД
    } catch (dbError) {
      this.logger.warn('База данных недоступна, пропускаем проверку подписок');
      return;
    }
    
    try {
      const deactivatedCount = await this.usersService.deactivateExpiredPremiums();
      if (deactivatedCount > 0) {
        this.logger.log(`Успешно деактивировано ${deactivatedCount} подписок.`);
      } else {
        this.logger.log('Истекших подписок не найдено.');
      }
    } catch (error) {
      this.logger.error('Ошибка при обработке истекших подписок:', error.message);
    }
  }
}