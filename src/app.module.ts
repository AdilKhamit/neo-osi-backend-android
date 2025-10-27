/**
 * @file src/app.module.ts
 * @description Корневой модуль приложения NestJS.
 * Собирает все функциональные модули, настраивает конфигурацию и подключение к базе данных.
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DataImportModule } from './data-import/data-import.module';
import { ChatModule } from './chat/chat.module';
import { DocumentsModule } from './documents/documents.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FinanceModule } from './finance/finance.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
import { GeneratedDocument } from './documents/entities/generated-document.entity';
import { DatabaseInitService } from './database-init.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Глобальный модуль конфигурации для доступа к .env файлам
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Асинхронная настройка подключения к базе данных PostgreSQL
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
        // Переопределяем entities и migrations, чтобы они работали с TS-файлами в разработке
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false, // ВНИМАНИЕ: true только для разработки. Автоматически применяет схему.
        logging: configService.get<string>('DB_LOGGING') === 'true',
      }),
    }),
    // Подключение всех функциональных модулей приложения
    AiModule,
    UsersModule,
    AuthModule,
    DataImportModule,
    DocumentsModule,
    ChatModule,
    SubscriptionsModule,
    FinanceModule,
    TasksModule,
    GeneratedDocument
  ],
  controllers: [AppController], // Корневой контроллер
  providers: [AppService, DatabaseInitService], // Корневой сервис
})
export class AppModule {}