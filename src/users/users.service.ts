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

  /**
   * Создает нового пользователя.
   * 👇 ТЕПЕРЬ СОХРАНЯЕТ ИМЯ (fullName)
   */
  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'passwordHash'>> {
    // Проверка на уникальность email
    const existingUser = await this.usersRepository.findOne({ where: { email: createUserDto.email } });
    if (existingUser) {
      throw new BadRequestException('Пользователь с таким email уже существует');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const newUser = this.usersRepository.create({
      email: createUserDto.email,
      passwordHash: hashedPassword, // Используем правильное имя свойства из entity
      fullName: createUserDto.fullName || null, // 👇 Сохраняем имя (или null)
      tariff: 'Базовый',
    });

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

  // 👇 ОБНОВЛЕННЫЙ МЕТОД ПРОФИЛЯ
  async getUserProfile(userId: number) {
    const user = await this.findOneById(userId);

    if (!user) {
      throw new NotFoundException('Пользователь не найден.');
    }
    
    // Проверяем активность подписки (Premium или Plus или Lite)
    const isPremiumActive = user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date();

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName, // 👇 Теперь берем из свойства fullName (которое мапится на full_name)
      role: user.tariff,       // Возвращаем название тарифа (Lite, Plus, Premium, Базовый)
      generations_count: user.generations_count || 0, 
      subscription: {
        isActive: !!isPremiumActive,
        expiresAt: isPremiumActive ? user.subscription_expires_at : null,
      },
    };
  }

  // --- Остальные методы (без изменений логики, только стиль) ---

  async resetGenerationsByEmail(email: string): Promise<User | null> {
    const user = await this.findOneByEmail(email);
    if (!user) return null;
    user.generations_count = 0;
    user.last_generation_date = null;
    return this.usersRepository.save(user);
  }

  async changePassword(userId: number, oldPass: string, newPass: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException('Пользователь не найден.');
    
    const isMatch = await bcrypt.compare(oldPass, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Неверный текущий пароль'); 

    const salt = await bcrypt.genSalt();
    const newHash = await bcrypt.hash(newPass, salt);

    await this.usersRepository.update(userId, {
      passwordHash: newHash,
      password_change_required: false,
    });
    
    return { message: 'Пароль успешно изменен.' };
  }

  async setCurrentRefreshToken(refreshToken: string | null, userId: number) {
    if (refreshToken) {
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await this.usersRepository.update(userId, { currentHashedRefreshToken: hashedRefreshToken });
    } else {
      await this.usersRepository.update(userId, { currentHashedRefreshToken: null });
    }
  }

  // Методы для Documents AI (оставляем как есть)
  async startDocChat(userId: number, templateName: string): Promise<void> {
    await this.usersRepository.update(userId, {
        doc_chat_template: templateName,
        doc_chat_question_index: 0,
        doc_chat_pending_data: {},
    });
  }

  async updateDocChatState(userId: number, nextQuestionIndex: number, pendingData: Record<string, any>, requestId: string | null = null): Promise<void> {
    await this.usersRepository.update(userId, {
        doc_chat_question_index: nextQuestionIndex,
        doc_chat_pending_data: pendingData,
        doc_chat_request_id: requestId,
    });
  }
}
