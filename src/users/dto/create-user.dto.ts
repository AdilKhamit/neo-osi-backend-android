import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Некорректный формат Email' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Пароль должен быть минимум 6 символов' })
  password: string;

  // 👇 ДОБАВЛЕНО ПОЛЕ ДЛЯ ИМЕНИ
  @IsString()
  @IsOptional() // Сделали необязательным, чтобы старый код не ломался
  fullName?: string;
}
