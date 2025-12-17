// src/users/entities/user.entity.ts

import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ChatMessage } from '../../chat/entities/chat-message.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ default: 'Базовый' })
  tariff: string;

  @Column({ nullable: true, default: null })
  full_name: string;

  @Column({ nullable: true, default: null })
  phone: string;

  @Column({ default: 'resident' })
  role: string; // Упростил тип до string для гибкости

  @Column({ type: 'timestamp', nullable: true, default: null })
  subscription_expires_at: Date | null;

  // 👇 ВАЖНО: ЭТО ПОЛЕ НУЖНО ДЛЯ СЧЕТЧИКА (1 бесплатно) 👇
  @Column({ default: 0 })
  generations_count: number;
  // ----------------------------------------------------

  @Column({ type: 'varchar', nullable: true, default: null })
  password_reset_token: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  password_reset_expires: Date | null;

  @Column({ type: 'boolean', default: false })
  password_change_required: boolean;

  // Поля для ИИ-Документов (Doc Chat State)
  @Column({ type: 'varchar', nullable: true, default: null })
  doc_chat_template: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  doc_chat_request_id: string | null;
  
  @Column({ type: 'integer', nullable: true, default: 0 })
  doc_chat_question_index: number;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  doc_chat_pending_data: Record<string, any>;

  // Для старой логики (можно оставить на всякий случай)
  @Column({ type: 'timestamp', nullable: true, default: null })
  last_generation_date: Date | null;

  // Токены
  @Column({ type: 'varchar', nullable: true, default: null })
  currentHashedRefreshToken?: string | null;
  
  // Связи
  @OneToMany(() => ChatMessage, (message) => message.user)
  chatMessages: ChatMessage[];

  // Даты создания/обновления (полезно для админки)
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
