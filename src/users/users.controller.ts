/**
 * @file src/users/users.controller.ts
 * @description Контроллер для управления эндпоинтами, связанными с пользователями.
 */

import { Controller, Post, Body, Get, UseGuards, Request, Param, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Эндпоинт для регистрации нового пользователя.
   * @param createUserDto - Данные для создания пользователя.
   * @returns Созданный объект пользователя.
   */
  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * Защищенный эндпоинт для получения данных профиля текущего пользователя.
   * @param req - Запрос, содержащий payload из JWT токена.
   * @returns Данные пользователя.
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const userId = req.user.userId;
    // Вызываем новый метод в UsersService
    return this.usersService.getUserProfile(userId);
  }

  /**
   * Защищенный эндпоинт для получения списка протоколов (пример).
   * @param req - Запрос.
   * @returns Статический список протоколов.
   */
  @UseGuards(JwtAuthGuard)
  @Get('protocols')
  getProtocols(@Request() req) {
    console.log(`Пользователь ${req.user.email} запросил протоколы.`);
    return [
      { id: 1, name: 'Протокол собрания №1 от 01.06.2025', url: '/files/protocol1.pdf' },
      { id: 2, name: 'Протокол собрания №2 от 01.07.2025', url: '/files/protocol2.pdf' },
    ];
  }

  /**
   * Отладочный эндпоинт для сброса лимита генераций пользователя по email.
   * @param email - Email пользователя.
   * @returns Сообщение об успехе и обновленные данные пользователя.
   */
  @Post('reset-limit/:email')
  async resetLimit(@Param('email') email: string) {
    console.log(`[DEBUG] Получен запрос на сброс лимита для пользователя: ${email}`);
    const updatedUser = await this.usersService.resetGenerationsByEmail(email);
    if (!updatedUser) {
      throw new NotFoundException(`Пользователь с email ${email} не найден.`);
    }
    return {
      message: `Лимит для пользователя ${email} успешно сброшен.`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        // 👇 ИСПРАВЛЕНО: generations_count (с буквой s)
        generations_count: updatedUser.generations_count,
      },
    };
  }

  /**
   * Эндпоинт для смены пароля аутентифицированным пользователем.
   */
  @UseGuards(JwtAuthGuard) // <-- Защищаем эндпоинт, доступ только для залогиненных
  @Post('change-password')
  async changePassword(
    @Request() req, // <-- Берем ID пользователя из токена
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    const userId = req.user.userId;
    return this.usersService.changePassword(
      userId,
      changePasswordDto.oldPassword,
      changePasswordDto.newPassword,
    );
  }
}
