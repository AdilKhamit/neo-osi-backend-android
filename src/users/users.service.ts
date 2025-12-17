/**
 * @file src/users/users.service.ts
 * @description Сервис для управления данными пользователей в базе данных.
 * Инкапсулирует всю логику работы с сущностью User.
 */

import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
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
   * Создает нового пользователя, хэширует пароль и сохраняет в базу данных.
   */
  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password_hash'>> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const newUser = this.usersRepository.create({
      email: createUserDto.email,
      password_hash: hashedPassword,
    });

    const savedUser = await this.usersRepository.save(newUser);
    const { password_hash, ...result } = savedUser;
    return result;
  }

  /**
   * Находит пользователя в базе данных по его email.
   */
  async findOneByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * Находит пользователя в базе данных по его ID.
   */
  async findOneById(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  // ==================================================================================
  // 👇 ГЛАВНОЕ ИЗМЕНЕНИЕ: Добавлен универсальный метод update 👇
  // Он нужен, чтобы AiController мог обновлять счетчик генераций или тариф.
  // ==================================================================================
  async update(id: number, attrs: Partial<User>) {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    // Копируем новые свойства в объект пользователя
    Object.assign(user, attrs);
    // Сохраняем изменения в базу
    return this.usersRepository.save(user);
  }

  /**
   * Увеличивает счетчик генераций на 1 и обновляет дату последней генерации.
   * @deprecated
   */
  async incrementGenerationCount(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      generation_count: () => 'generation_count + 1',
      last_generation_date: new Date(),
    });
  }

  /**
   * Сбрасывает счетчик генераций пользователя.
   * @deprecated
   */
  async resetGenerationCount(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      generation_count: 0,
    });
  }

  async resetGenerationsByEmail(email: string): Promise<User | null> {
    const user = await this.findOneByEmail(email);
    if (!user) {
      return null;
    }
    user.generation_count = 0;
    user.last_generation_date = null;
    return this.usersRepository.save(user);
  }

  async setLastGenerationDate(userId: number, date: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      last_generation_date: date,
    });
  }

  async activatePremium(userId: number, expirationDate: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      tariff: 'Премиум',
      subscription_expires_at: expirationDate,
    });
  }

  async deactivatePremium(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
      tariff: 'Базовый',
      subscription_expires_at: null,
    });
  }

  async setPasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      password_reset_token: token,
      password_reset_expires: expires,
    });
  }

  async findOneByPasswordResetToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: {
        password_reset_token: token,
      },
    });
  }

  async updatePassword(userId: number, password_hash: string): Promise<void> {
    await this.usersRepository.update(userId, {
      password_hash: password_hash,
      password_reset_token: null,
      password_reset_expires: null,
    });
  }

  async changePassword(userId: number, oldPass: string, newPass: string): Promise<{ message: string }> {
    const user = await this.usersRepository.findOneBy({ id: userId });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден.');
    }
    
    const isMatch = await bcrypt.compare(oldPass, user.password_hash);
    if (!isMatch) {
        throw new UnauthorizedException('Неверный текущий пароль'); // Добавил проверку для надежности
    }

    const salt = await bcrypt.genSalt();
    const newHash = await bcrypt.hash(newPass, salt);

    await this.usersRepository.update(userId, {
      password_hash: newHash,
      password_change_required: false,
    });
    
    return { message: 'Пароль успешно изменен.' };
  }

  async deactivateExpiredPremiums(): Promise<number> {
    const now = new Date();
    
    const expiredUsers = await this.usersRepository.find({
      where: {
        tariff: 'Премиум',
        subscription_expires_at: LessThan(now),
      },
    });

    if (expiredUsers.length === 0) {
      return 0;
    }

    const userIds = expiredUsers.map(user => user.id);

    await this.usersRepository.update(userIds, {
      tariff: 'Базовый',
      subscription_expires_at: null,
    });

    return userIds.length;
  }

  async getUserProfile(userId: number) {
    const user = await this.findOneById(userId);

    if (!user) {
      throw new NotFoundException('Пользователь не найден.');
    }
    
    const isPremiumActive = (user.tariff === 'Премиум' || user.tariff === 'Premium') && user.subscription_expires_at && user.subscription_expires_at > new Date();

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      role: user.role,
      generations_count: user['generations_count'] || 0, // Добавил поле, чтобы фронт видел счетчик
      subscription: {
        isActive: isPremiumActive,
        expiresAt: isPremiumActive ? user.subscription_expires_at : null,
      },
    };
  }

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

  async setCurrentRefreshToken(refreshToken: string | null, userId: number) {
    if (refreshToken) {
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await this.usersRepository.update(userId, {
        currentHashedRefreshToken: hashedRefreshToken,
      });
    } else {
      await this.usersRepository.update(userId, {
        currentHashedRefreshToken: null,
      });
    }
  }

  async resetDocChatState(userId: number): Promise<void> {
    await this.usersRepository.update(userId, {
        doc_chat_template: null,
        doc_chat_question_index: 0,
        doc_chat_pending_data: {},
    });
  }
}
