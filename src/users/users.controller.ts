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
    return this.usersService.getUserProfile(userId);
  }

  /**
   * Защищенный эндпоинт для получения списка протоколов (пример).
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
   * 👇 НОВЫЙ ЭНДПОИНТ: ПОКУПКА ПОДПИСКИ
   * Принимает planId ('lite', 'plus', 'premium') и обновляет дату подписки.
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  async subscribe(@Request() req, @Body() body: { planId: string }) {
    const userId = req.user.userId;
    const user = await this.usersService.findOneById(userId);
    
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    let monthsToAdd = 0;
    let newTariffName = 'Free';

    // 1. Определяем условия тарифа
    switch (body.planId) {
      case 'lite':
        monthsToAdd = 1; // 1 месяц
        newTariffName = 'Lite';
        break;
      case 'plus':
        monthsToAdd = 6; // 6 месяцев
        newTariffName = 'Plus';
        break;
      case 'premium':
        monthsToAdd = 12; // 1 год
        newTariffName = 'Premium';
        break;
      default:
        throw new NotFoundException('Указанный тарифный план не найден');
    }

    // 2. Рассчитываем новую дату окончания
    const currentDate = new Date();
    // Если у пользователя уже есть активная подписка, продлеваем её.
    // Если нет (или истекла) — начинаем отсчет с сегодняшнего дня.
    const startDate = (user.subscription_expires_at && new Date(user.subscription_expires_at) > currentDate) 
                      ? new Date(user.subscription_expires_at) 
                      : currentDate;

    const newExpiryDate = new Date(startDate);
    newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsToAdd);

    // 3. Обновляем данные в базе
    // Используем 'as any' для частичного обновления, если в DTO нет этих полей
    await this.usersService.update(userId, { 
      tariff: newTariffName,
      subscription_expires_at: newExpiryDate 
    } as any);

    return { 
      message: `Тариф ${newTariffName} успешно активирован!`,
      tariff: newTariffName,
      expiresAt: newExpiryDate
    };
  }

  /**
   * Отладочный эндпоинт для сброса лимита генераций пользователя по email.
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
        generations_count: updatedUser.generations_count,
      },
    };
  }

  /**
   * Эндпоинт для смены пароля аутентифицированным пользователем.
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Request() req,
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
