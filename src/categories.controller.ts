import { Controller, Get } from '@nestjs/common';

@Controller('categories')
export class CategoriesController {
  @Get()
  findAll() {
    return [
      {
        id: 1,
        title: 'Диспетчерское и аварийно-ремонтное обслуживание',
        icon: 'PhoneInTalk'
      },
      {
        id: 2,
        title: 'Капитальный ремонт общего имущества',
        icon: 'Build'
      },
      {
        id: 3,
        title: 'Сбор и вывоз ТБО и КГО',
        icon: 'DeleteOutline'
      },
      {
        id: 4,
        title: 'Создание ОСИ',
        icon: 'HomeWork'
      }
    ];
  }
}
