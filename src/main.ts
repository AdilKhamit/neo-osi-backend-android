// src/main.ts
import * as dotenv from 'dotenv';
dotenv.config();

import * as crypto from 'crypto';

if (!global.crypto) {
  Object.defineProperty(global, 'crypto', {
    value: {
      randomUUID: () => crypto.randomUUID(),
    },
    configurable: true,
  });
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import axios from 'axios';
import AppDataSource from './data-source';

// --- НАШ СЕКРЕТНЫЙ РУБИЛЬНИК ---
const STATUS_URL = 'https://api.jsonbin.io/v3/b/68ac938543b1c97be929bd6c';

async function checkAppStatus() {
  try {
    const response = await axios.get(STATUS_URL, { timeout: 5000 });
    // Проверяем поле "status" в полученном JSON
    if (response.data?.record?.status !== 'ENABLED') {
      console.error('Application status is not ENABLED. Shutting down.');
      process.exit(1);
    }
    console.log('Application status check passed.');
  } catch (error) {
    // В разработке просто логируем ошибку, но не останавливаем приложение
    if (process.env.NODE_ENV === 'production') {
      console.error('Failed to check application status. Shutting down.', error.message);
      process.exit(1);
    } else {
      console.warn('Status check failed in development mode, continuing...', error.message);
    }
  }
}
// --- КОНЕЦ БЛОКА РУБИЛЬНИКА ---


async function bootstrap() {
  console.log('🚀 Starting Neo OSI Backend...');
  
  // Status check временно отключена
  // if (process.env.ENABLE_STATUS_CHECK === 'true') {
  //   await checkAppStatus();
  // }

  // ПРИНУДИТЕЛЬНЫЙ запуск миграций для всех случаев, где есть DATABASE_URL
  const shouldRunMigrations = !!process.env.DATABASE_URL;
  console.log('🔍 Migration check:', {
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL ? 'Present' : 'Missing',
    shouldRun: shouldRunMigrations
  });
  
  if (shouldRunMigrations) {
    try {
      console.log('🔄 Initializing database connection...');
      console.log('📋 Database config:', {
        url: process.env.DATABASE_URL ? '✓ Present' : '✗ Missing',
        host: process.env.DB_HOST || 'Not set',
        port: process.env.DB_PORT || 'Not set',
      });
      
      if (!AppDataSource.isInitialized) {
        console.log('⚡ Connecting to database...');
        await AppDataSource.initialize();
        console.log('✅ Database connection initialized');
      } else {
        console.log('ℹ️ Database already initialized');
      }
      
      console.log('📊 Running database migrations...');
      const migrations = await AppDataSource.runMigrations();
      console.log(`✅ Applied ${migrations.length} migrations successfully`);
      
      if (migrations.length === 0) {
        console.log('ℹ️ No pending migrations found - checking if tables exist...');
        
        // Проверяем, существует ли таблица users
        try {
          const result = await AppDataSource.query("SELECT COUNT(*) FROM users LIMIT 1");
          console.log('✅ Users table exists and accessible');
        } catch (tableError) {
          console.error('❌ Users table does not exist - this is the problem!');
          console.error('🔧 You may need to manually run migrations in the database');
        }
      }
      
    } catch (error) {
      console.error('❌ Database migration failed:', error.message);
      console.error('🔍 Full error:', error);
      
      // Пробуем создать таблицы принудительно
      try {
        console.log('🔧 Attempting emergency database setup...');
        await AppDataSource.synchronize(true); // Принудительная синхронизация
        console.log('✅ Emergency database sync completed');
      } catch (syncError) {
        console.error('❌ Emergency sync also failed:', syncError.message);
      }
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Настраиваем раздачу статики (CSS, JS файлы, если будут)
  app.useStaticAssets(join(__dirname, '..', 'public'));
  // Указываем, где лежат наши "view" (шаблоны)
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  // Устанавливаем hbs как движок для рендеринга
  app.setViewEngine('hbs');

  app.enableCors();
  
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Port: ${port}`);
}
bootstrap();