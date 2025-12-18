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
        // Используем самую быструю и легкую модель Flash 2.0
        this.model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        this.logger.log('🚀 ChatAiService: ULTRA-LITE режим (Без RAG) активирован');
    }

    async getChatAnswer(prompt: string, userId: number): Promise<string> {
        this.logger.log(`[Chat Lite] Вопрос от пользователя ${userId}: ${prompt}`);

        const systemPrompt = `
        Ты — "NeoOSI", экспертный AI-ассистент, специализирующийся на вопросах ОСИ и ЖКХ в Казахстане.
        Твоя задача — консультировать жильцов и председателей.
        Отвечай вежливо, кратко и по делу. Ссылайся на законы РК, если знаешь их.
        
        ЯЗЫК: Твой ответ ДОЛЖЕН БЫТЬ СТРОГО на том же языке, на котором написан вопрос пользователя (казахский или русский).
        ФОРМАТ: ЗАПРЕЩЕНО использовать Markdown (*, **, #). Только чистый текст и переносы строк.
        
        Вопрос пользователя: ${prompt}
        `;

        try {
            // Прямой запрос к Gemini без долгого поиска по документам (ответ за 1-2 секунды)
            const result = await this.model.generateContent(systemPrompt);
            const answer = result.response.text();

            // Сохраняем в историю
            await this.chatHistoryService.addMessageToHistory(userId, prompt, answer, ChatType.GENERAL);
            
            return answer.replace(/[*#_`~]/g, '');

        } catch (e) {
            this.logger.error('Ошибка Gemini:', e);
            return "Извините, сейчас я не могу ответить. Попробуйте позже.";
        }
    }

    // Заглушки, чтобы не ломать контроллер и другие части приложения
    public async detectLanguage(t: string): Promise<'ru' | 'kz'> { return 'ru'; }
    public async rebuildIndex(): Promise<void> { this.logger.log('Индекс не используется в Lite режиме'); }
}
