/**
 * @file src/ai/ai.controller.ts
 * @description Контроллер, отвечающий за обработку всех запросов к AI-ассистенту.
 * Является точкой входа для /ai/chat. Управляет состоянием диалога,
 * вызывает AI-сервис для получения ответов и генерации документов.
 */

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  NotFoundException,
  Res,
  Param,
  Get,
  StreamableFile
} from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { DocxService } from '../documents/docx/docx.service';
import { User } from '../users/entities/user.entity';
import * as crypto from 'crypto';
import { TEMPLATES_REGISTRY } from './templates.registry';
import { ChatHistoryService } from 'src/chat/history/history.service';
import { ChatAiService } from './chat-ai.service';
import { DocumentAiService } from './document-ai.service';
import { ChatType } from 'src/chat/entities/chat-message.entity';
import { createReadStream } from 'fs';
import * as path from 'path';

@Controller('ai')
export class AiController {
  /**
   * @param aiService Сервис для взаимодействия с моделями Google Gemini.
   * @param usersService Сервис для работы с данными пользователей.
   * @param docxService Сервис для генерации .docx файлов из шаблонов.
   */
  constructor(
    private readonly chatAiService: ChatAiService,
    private readonly documentAiService: DocumentAiService,
    private readonly usersService: UsersService,
    private readonly docxService: DocxService,
    private readonly chatHistoryService: ChatHistoryService
  ) { }

  /**
   * Эндпоинт для "ИИ-Чат".
   * Отвечает за ведение диалога, ответы на вопросы, RAG.
   */

  // ВРЕМЕННО ОТКЛЮЧИЛИ ЗАЩИТУ ДЛЯ ТЕСТА В POSTMAN
  // @UseGuards(JwtAuthGuard) 
  @Post('chat')
  async chatWithAssistant(@Request() req, @Body() generateDto: GenerateDocumentDto) {
    // ВРЕМЕННО: Ставим ID = 1, чтобы сервер знал "фейкового" пользователя
    const userId = 1; 
    // const userId = req.user.userId; // <-- Оригинальная строка
    
    // Проверяем, что prompt не пустой
    if (!generateDto.prompt || generateDto.prompt.trim() === '') {
      return { aiResponse: { message: 'Пожалуйста, введите ваш вопрос.' } };
    }
    
    const response = await this.chatAiService.getChatAnswer(generateDto.prompt, userId);
    return { aiResponse: response };
  }

  @UseGuards(JwtAuthGuard)
  @Post('documents')
  async handleDocumentChat(
    @Request() req,
    @Body() generateDto: GenerateDocumentDto,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;
    const user = await this.usersService.findOneById(userId);
    if (!user) { throw new NotFoundException('Пользователь не найден.'); }

    // Проверяем, что prompt не пустой
    if (!generateDto.prompt || generateDto.prompt.trim() === '') {
      return res.status(400).json({ 
        aiResponse: { message: 'Пожалуйста, опишите какой документ вы хотите создать.' } 
      });
    }

    // --- НОВАЯ ПРОВЕРКА НА ПРЕМИУМ-ПОДПИСКУ ---
    const isPremium = user.tariff === 'Премиум' && user.subscription_expires_at && user.subscription_expires_at > new Date();

    if (!isPremium) {
      // Формируем сообщение сразу на двух языках
      const messageText = `"ЖИ-Құжаттар" — бұл Премиум-мүмкіндік. 
Жазылымды ресімдеп, кез келген актіні немесе есепті бірнеше минут ішінде жасаңыз!
---
"ИИ-Документы" — это Премиум-функция.
Оформите подписку и создавайте любые акты и отчеты за считанные минуты!`;

      const accessDeniedMessage = {
        type: 'chat',
        content: {
          action: 'clarification',
          message: messageText,
        },
      };

      // Сохраняем в историю
      await this.chatHistoryService.addMessageToHistory(
        userId,
        generateDto.prompt || 'Создание документа',
        accessDeniedMessage.content.message,
        ChatType.DOCUMENT
      );

      // Отправляем ответ
      return res.status(200).json({ aiResponse: accessDeniedMessage.content });
    }

    // --- НАЧАЛО НОВОЙ, ИСПРАВЛЕННОЙ И НАДЕЖНОЙ ЛОГИКИ ---
    // 1. Вызываем единый "умный" метод в сервисе, который сделает всю работу.
    const response = await this.documentAiService.processDocumentMessage(generateDto.prompt, user);

    // 2. Формируем контент ответа модели для сохранения.
    const modelResponseContent = response.historyContent || (response.type === 'file'
      ? `Документ "${response.fileName}" успешно сгенерирован.`
      : JSON.stringify(response.content));

    // 3. Сохраняем и запрос пользователя, и ответ модели ОДНИМ вызовом в самом конце.
    await this.chatHistoryService.addMessageToHistory(
      userId,
      generateDto.prompt || 'Создание документа',
      modelResponseContent,
      ChatType.DOCUMENT
    );

    // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

    // 4. Отправляем ответ пользователю (этот блок остается без изменений).
    if (response.type === 'file') {
      if (!response.fileName) {
        return res.status(500).json({ aiResponse: "Внутренняя ошибка: отсутствует имя файла." });
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${response.fileName}"`);
      return res.send(response.content);
    } else {
      // Отправка JSON (вопросы или уточнения)
      return res.status(200).json({ aiResponse: response.content });
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('documents/download/:fileId')
  async downloadDocument(
    @Request() req,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const userId = req.user.userId;
    // Вам понадобится метод в сервисе для поиска документа и проверки прав
    const doc = await this.documentAiService.getGeneratedDocument(fileId, userId);

    if (!doc) {
      throw new NotFoundException('Документ не найден или у вас нет прав на его скачивание.');
    }

    const filePath = doc.storagePath;
    const file = createReadStream(filePath);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.originalFileName}"`);

    return new StreamableFile(file);
  }
}
