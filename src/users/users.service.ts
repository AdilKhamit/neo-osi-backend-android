/**
 * @file src/users/users.service.ts
 * @description Сервис для управления данными пользователей.
 */

import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // --- CRUD ---

  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'passwordHash'>> {
    const existingUser = await this.usersRepository.findOne({ where: { email: createUserDto.email } });
    if (existingUser) {
      throw new BadRequestException('Пользователь с таким email уже существует');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    // Используем 'as any' чтобы избежать конфликтов типов при создании (null vs undefined)
    const newUser = this.usersRepository.create({
      email: createUserDto.email,
      passwordHash: hashedPassword,
      fullName: createUserDto.fullName || undefined, 
      tariff: 'Базовый',
    } as any);

    const savedUser = await this.usersRepository.save(newUser);
    const { passwordHash, ...result } = savedUser;
    return result;
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOneById(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async update(id: number, attrs: Partial<User>) {
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    Object.assign(user, attrs);
    return this.usersRepository.save(user);
  }

  async getUserProfile(userId: number) {
    const user = await this.findOneById(userId);
    if (!user) throw new NotFoundException('Пользователь не найден.');
    
    // Проверяем активность подписки
    const isPremiumActive = user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.tariff,
      generations_count: user.generations_count || 0, 
      subscription: {
        isActive: !!isPremiumActive,
        expiresAt: isPremiumActive ? user.subscription_expires_at : null,
      },
    };
  }

  // --- МЕТОДЫ ДЛЯ AUTH SERVICE (Исправление ошибок сборки) ---

  async setPasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
    await this.update(userId, {
      password_reset_token: token,
      password_reset_expires: expires,
    });
  }

  async findOneByPasswordResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { password_reset_token: token } });
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await this.update(userId, {
      passwordHash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
    });
  }

  async changePassword(userId: number, oldPass: string, newPass: string): Promise<{ message: string }> {
    const user = await this.findOneById(userId);
    if (!user) throw new UnauthorizedException('Пользователь не найден.');
    
    const isMatch = await bcrypt.compare(oldPass, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Неверный текущий пароль'); 

    const salt = await bcrypt.genSalt();
    const newHash = await bcrypt.hash(newPass, salt);

    await this.update(userId, {
      passwordHash: newHash,
      password_change_required: false,
    });
    
    return { message: 'Пароль успешно изменен.' };
  }

  async setCurrentRefreshToken(refreshToken: string | null, userId: number) {
    if (refreshToken) {
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await this.update(userId, { currentHashedRefreshToken: hashedRefreshToken });
    } else {
      await this.update(userId, { currentHashedRefreshToken: null });
    }
  }

  // --- МЕТОДЫ ДЛЯ DOCUMENT AI SERVICE (Исправление ошибок сборки) ---

  async startDocChat(userId: number, templateName: string): Promise<void> {
    await this.update(userId, {
        doc_chat_template: templateName,
        doc_chat_question_index: 0,
        doc_chat_pending_data: {},
    });
  }

  async resetDocChatState(userId: number): Promise<void> {
    await this.update(userId, {
        doc_chat_template: null,
        doc_chat_question_index: 0,
        doc_chat_pending_data: {},
    });
  }

  async updateDocChatState(userId: number, nextQuestionIndex: number, pendingData: Record<string, any>, requestId: string | null = null): Promise<void> {
    await this.update(userId, {
        doc_chat_question_index: nextQuestionIndex,
        doc_chat_pending_data: pendingData,
        doc_chat_request_id: requestId,
    });
  }

  async setLastGenerationDate(userId: number, date: Date): Promise<void> {
    await this.update(userId, { last_generation_date: date });
  }

  async resetGenerationsByEmail(email: string): Promise<User | null> {
    const user = await this.findOneByEmail(email);
    if (!user) return null;
    user.generations_count = 0;
    user.last_generation_date = null;
    return this.usersRepository.save(user);
  }

  // --- МЕТОДЫ ДЛЯ SUBSCRIPTIONS И TASKS (Исправление ошибок сборки) ---

  async activatePremium(userId: number, expirationDate: Date): Promise<void> {
    await this.update(userId, {
      tariff: 'Premium',
      subscription_expires_at: expirationDate,
    });
  }

  async deactivatePremium(userId: number): Promise<void> {
    await this.update(userId, {
      tariff: 'Базовый',
      subscription_expires_at: null,
    });
  }

  async deactivateExpiredPremiums(): Promise<number> {
    const now = new Date();
    const expiredUsers = await this.usersRepository.find({
      where: {
        tariff: 'Premium',
        subscription_expires_at: LessThan(now),
      },
    });

    if (expiredUsers.length === 0) return 0;

    const userIds = expiredUsers.map(user => user.id);
    
    // Массовое обновление через QueryBuilder для эффективности
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ tariff: 'Базовый', subscription_expires_at: null })
      .whereInIds(userIds)
      .execute();

    return userIds.length;
  }
}
