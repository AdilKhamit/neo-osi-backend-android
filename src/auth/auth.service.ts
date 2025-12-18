/**
 * @file src/auth/auth.service.ts
 * @description Сервис, реализующий логику аутентификации пользователей.
 */

import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /**
   * Проверяет учетные данные пользователя.
   * 👇 ИСПРАВЛЕНО: password_hash -> passwordHash
   */
  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    // Используем новое имя свойства passwordHash
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      // Исключаем хэш из результата
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  /**
   * Генерирует и возвращает JWT токен.
   */
  async login(user: any) {
    const payload = { email: user.email, sub: user.id, tariff: user.tariff };
    
    // Создаем оба токена
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRATION', '1h')
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    // Хэшируем и сохраняем refresh token в базу
    await this.usersService.setCurrentRefreshToken(refreshToken, user.id);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.usersService.findOneById(userId);
    if (!user || !user.currentHashedRefreshToken) {
      throw new ForbiddenException('Access Denied');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.currentHashedRefreshToken,
    );

    if (!refreshTokenMatches) {
      throw new ForbiddenException('Access Denied');
    }

    const newTokens = await this.login(user);
    return newTokens;
  }

  async logout(userId: number) {
    return this.usersService.setCurrentRefreshToken(null, userId);
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      console.warn(`Запрос на сброс пароля для несуществующего email: ${email}`);
      return { message: 'Если такой пользователь существует, ему будет отправлена ссылка для сброса пароля.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 час

    await this.usersService.setPasswordResetToken(user.id, token, expires);
    await this.mailService.sendPasswordResetEmail(user.email, token);

    return { message: 'Если такой пользователь существует, ему будет отправлена ссылка для сброса пароля.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersService.findOneByPasswordResetToken(token);

    if (!user) {
      throw new UnauthorizedException('Токен для сброса пароля недействителен или истек.');
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await this.usersService.updatePassword(user.id, hashedPassword);

    return { message: 'Пароль успешно обновлен.' };
  }

  async refreshTokenForUser(userId: number) {
    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден для обновления токена.');
    }

    const payload = { email: user.email, sub: user.id, tariff: user.tariff };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
