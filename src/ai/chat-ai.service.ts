import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatHistoryService } from '../chat/history/history.service';
import { ChatType } from '../chat/entities/chat-message.entity';

@Injectable()
export class ChatAiService implements OnModuleInit {
    private readonly logger = new Logger(ChatAiService.name);
    private model: any;

    constructor(
        private readonly configService: ConfigService,
        private readonly chatHistoryService: ChatHistoryService,
    ) { }

    async onModuleInit() {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

        const genAI = new GoogleGenerativeAI(apiKey);
        // Используем самую быструю модель Flash
        this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        this.logger.log('🚀 ChatAiService: LITE режим с поддержкой generateWithRetry');
    }

    // --- Метод для Чата ---
    async getChatAnswer(prompt: string, userId: number): Promise<string> {
        this.logger.log(`[Chat] Запрос от пользователя ${userId}: ${prompt}`);

        const systemPrompt = `
        Ты — "NeoOSI", экспертный AI-ассистент по вопросам ОСИ и ЖКХ в Казахстане.
        Отвечай вежливо, кратко и только текстом без Markdown (*, #).
        Вопрос пользователя: ${prompt}
        `;

        try {
            const result = await this.model.generateContent(systemPrompt);
            const answer = result.response.text();
            await this.chatHistoryService.addMessageToHistory(userId, prompt, answer, ChatType.GENERAL);
            return answer.replace(/[*#_`~]/g, '');
        } catch (e) {
            this.logger.error('Ошибка Gemini в чате:', e);
            return "Извините, произошла ошибка. Попробуйте еще раз.";
        }
    }

    // --- 👇 ВОТ ЭТОТ МЕТОД НУЖЕН ДЛЯ DocumentAiService 👇 ---
    async generateWithRetry(prompt: string): Promise<string> {
        try {
            const result = await this.model.generateContent(prompt);
            return result.response.text();
        } catch (e) {
            this.logger.error('Ошибка в generateWithRetry:', e);
            throw e;
        }
    }

    // Заглушки для совместимости
    public async detectLanguage(text: string): Promise<'ru' | 'kz'> {
        return text.match(/[а-яА-Я]/) ? 'ru' : 'kz';
    }
    
    public async rebuildIndex(): Promise<void> {
        this.logger.log('Индекс не используется в текущем режиме');
    }
}
