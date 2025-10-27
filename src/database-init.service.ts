import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    console.log('🔧 DatabaseInitService: Starting database initialization...');
    
    try {
      // Проверяем, инициализирована ли база
      if (!this.dataSource.isInitialized) {
        console.log('❌ DataSource is not initialized - this should not happen in NestJS');
        return;
      }
      
      console.log('✅ DataSource is initialized, checking migrations...');
      
      // Запускаем миграции
      const migrations = await this.dataSource.runMigrations();
      console.log(`✅ Applied ${migrations.length} migrations successfully`);
      
      if (migrations.length === 0) {
        console.log('ℹ️ No pending migrations found - checking if tables exist...');
        
        // Проверяем, существует ли таблица users
        try {
          const result = await this.dataSource.query("SELECT COUNT(*) FROM users LIMIT 1");
          console.log('✅ Users table exists and accessible');
        } catch (tableError) {
          console.error('❌ Users table does not exist - attempting to create schema...');
          
          // Пробуем принудительную синхронизацию
          try {
            console.log('🔧 Attempting database synchronization...');
            await this.dataSource.synchronize();
            console.log('✅ Database synchronization completed');
            
            // Проверяем еще раз
            await this.dataSource.query("SELECT COUNT(*) FROM users LIMIT 1");
            console.log('✅ Users table now exists after sync');
          } catch (syncError) {
            console.error('❌ Database sync failed:', syncError.message);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ DatabaseInitService failed:', error.message);
      console.error('🔍 Full error:', error);
    }
  }
}
