import { Controller, Post, Body, UseGuards, Request, NotFoundException, Res, Param, Get, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateDocumentDto } from './dto/generate-document.dto';
import { DocxService } from '../documents/docx/docx.service';
import { ChatHistoryService } from 'src/chat/history/history.service';
import { ChatAiService } from './chat-ai.service';
import { DocumentAiService } from './document-ai.service';
import { ChatType } from 'src/chat/entities/chat-message.entity';
import { createReadStream } from 'fs';

@Controller('ai')
export class AiController {
  constructor(
    private readonly chatAiService: ChatAiService,
    private readonly documentAiService: DocumentAiService,
    private readonly usersService: UsersService,
    private readonly docxService: DocxService,
    private readonly chatHistoryService: ChatHistoryService
  ) { }

  // 1. ЧАТ (Бесплатно для всех и всегда)
  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chatWithAssistant(@Request() req, @Body() generateDto: GenerateDocumentDto) {
    const userId = req.user.userId;
    if (!generateDto.prompt || generateDto.prompt.trim() === '') {
      return { aiResponse: { message: 'Пожалуйста, введите ваш вопрос.' } };
    }
    const response = await this.chatAiService.getChatAnswer(generateDto.prompt, userId);
    return { aiResponse: response };
  }

  // 2. ГЕНЕРАЦИЯ ДОКУМЕНТОВ (1 Бесплатно -> потом Платно)
  @UseGuards(JwtAuthGuard)
  @Post('documents')
  async handleDocumentChat(@Request() req, @Body() generateDto: GenerateDocumentDto, @Res() res: Response) {
    const userId = req.user.userId;
    const user = await this.usersService.findOneById(userId);
    if (!user) throw new NotFoundException('Пользователь не найден.');

    if (!generateDto.prompt || generateDto.prompt.trim() === '') {
      return res.status(400).json({ aiResponse: { message: 'Опишите, какой документ вам нужен.' } });
    }

    // --- ЛОГИКА ДОСТУПА ---

    // 1. Проверяем Премиум (Тариф + Дата)
    const isPremium = (user.tariff === 'Premium' || user.tariff === 'Plus') && 
                      (user.subscription_expires_at && new Date(user.subscription_expires_at) > new Date());

    // 2. Получаем счетчик использований (если нет поля, считаем 0)
    const generationsUsed = user['generations_count'] || 0; 
    const FREE_LIMIT = 1;

    // 3. БЛОКИРОВКА: Если НЕ премиум И лимит исчерпан
    if (!isPremium && generationsUsed >= FREE_LIMIT) {
      const msg = `Вы использовали бесплатную генерацию (1 из 1).\nЧтобы создавать документы без ограничений, оформите подписку NeoOSI Premium.`;
      
      // Отправляем специальный сигнал 'buy_subscription'
      return res.status(200).json({ 
        aiResponse: { 
          message: msg, 
          action: 'buy_subscription' 
        } 
      });
    }

    // --- ГЕНЕРАЦИЯ ---
    
    // Если мы здесь — значит доступ есть. Запускаем ИИ.
    const response = await this.documentAiService.processDocumentMessage(generateDto.prompt, user);

    // --- СЧЕТЧИК ---
    
    // Если пользователь на бесплатном тарифе, мы обязаны засчитать попытку
    if (!isPremium) {
      try {
        const newCount = generationsUsed + 1;
        // Обновляем пользователя в базе. Используем 'as any', чтобы TypeScript не ругался на отсутствие поля в типах
        await this.usersService.update(userId, { generations_count: newCount } as any);
      } catch (e) {
        console.error('Ошибка при обновлении счетчика:', e);
      }
    }

    // Сохраняем историю
    const content = response.type === 'file' ? `Документ ${response.fileName} создан.` : JSON.stringify(response.content);
    await this.chatHistoryService.addMessageToHistory(userId, generateDto.prompt, content, ChatType.DOCUMENT);

    // Отправляем ответ
    if (response.type === 'file') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${response.fileName}"`);
      return res.send(response.content);
    } else {
      return res.status(200).json({ aiResponse: response.content });
    }
  }

  // 3. СКАЧИВАНИЕ ФАЙЛА
  @UseGuards(JwtAuthGuard)
  @Get('documents/download/:fileId')
  async downloadDocument(@Request() req, @Param('fileId') fileId: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const userId = req.user.userId;
    const doc = await this.documentAiService.getGeneratedDocument(fileId, userId);
    
    if (!doc) {
      throw new NotFoundException('Документ не найден.');
    }

    const file = createReadStream(doc.storagePath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.originalFileName}"`);
    return new StreamableFile(file);
  }
}
