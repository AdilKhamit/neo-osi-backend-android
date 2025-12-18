// src/users/entities/user.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ChatMessage } from '../../chat/entities/chat-message.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // 👇 ИСПРАВЛЕНО: Свойство camelCase для кода, но колонка snake_case для базы
  @Column({ name: 'password_hash' }) 
  passwordHash: string;

  @Column({ default: 'Базовый' })
  tariff: string;

  // 👇 ВАЖНО: Имя свойства 'fullName' совпадает с DTO, поэтому данные сохранятся!
  @Column({ name: 'full_name', nullable: true }) 
  fullName: string;

  @Column({ nullable: true, default: null })
  phone: string;

  @Column({ default: 'resident' })
  role: string;

  // Используем snake_case, так как это поле уже используется в контроллере
  @Column({ type: 'timestamp', nullable: true, default: null })
  subscription_expires_at: Date | null;

  // 👇 ЭТО ПОЛЕ НУЖНО ДЛЯ СЧЕТЧИКА (1 бесплатно)
  @Column({ default: 0 })
  generations_count: number;
  // ----------------------------------------------------

  @Column({ type: 'varchar', nullable: true, default: null })
  password_reset_token: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  password_reset_expires: Date | null;

  @Column({ type: 'boolean', default: false })
  password_change_required: boolean;

  // --- Поля для ИИ-Документов (Doc Chat State) ---
  @Column({ type: 'varchar', nullable: true, default: null })
  doc_chat_template: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  doc_chat_request_id: string | null;
  
  @Column({ type: 'integer', nullable: true, default: 0 })
  doc_chat_question_index: number;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  doc_chat_pending_data: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true, default: null })
  last_generation_date: Date | null;

  // Токены
  @Column({ type: 'varchar', nullable: true, default: null })
  currentHashedRefreshToken?: string | null;
  
  // Связи
  @OneToMany(() => ChatMessage, (message) => message.user)
  chatMessages: ChatMessage[];

  // Даты
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
