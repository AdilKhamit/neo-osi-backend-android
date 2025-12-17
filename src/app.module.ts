/**
 * @file src/app.module.ts
 * @description Корневой модуль приложения NestJS.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseInitService } from './database-init.service'; // Не забываем импорт

// Контроллер для теста категорий
import { CategoriesController } from './categories.controller';

// --- ИМПОРТЫ МОДУЛЕЙ ---
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module'; // <-- Вернули почту
import { DataImportModule } from './data-import/data-import.module';
import { ChatModule } from './chat/chat.module';
import { DocumentsModule } from './documents/documents.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FinanceModule } from './finance/finance.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: true, // Для разработки true ок, для продакшена лучше false
        logging: configService.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    
    // ФУНКЦИОНАЛЬНЫЕ МОДУЛИ
    AiModule,
    UsersModule,
    AuthModule,
    MailModule, // <-- Обязательно нужен
    DataImportModule,
    DocumentsModule,
    ChatModule,
    SubscriptionsModule,
    FinanceModule,
    TasksModule,
    // GeneratedDocument <-- УБРАЛИ (ЭТО БЫЛА ОШИБКА, ЭТО НЕ МОДУЛЬ)
  ],
  controllers: [AppController, CategoriesController], // <-- Добавили CategoriesController
  providers: [AppService, DatabaseInitService],
})
export class AppModule {}
