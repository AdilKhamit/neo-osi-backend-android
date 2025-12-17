// src\ai\document-ai.service.ts 

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Content, TaskType, Part } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { ChatHistoryService } from '../chat/history/history.service';
import { TEMPLATES_REGISTRY } from './templates.registry';
import { ChatType } from '../chat/entities/chat-message.entity';
import { User } from '../users/entities/user.entity'; // <-- ИСПРАВЛЕНИЕ
import { UsersService } from '../users/users.service'; // <-- ИСПРАВЛЕНИЕ
import { DocxService } from '../documents/docx/docx.service'; // <-- ИСПРАВЛЕНИЕ
import * as crypto from 'crypto';
import { ChatAiService } from './chat-ai.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeneratedDocument } from 'src/documents/entities/generated-document.entity';
import { v4 as uuidv4 } from 'uuid';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type DocumentProcessingResponse = {
    type: 'chat' | 'file';
    content: any;
    fileName?: string;
    historyContent?: string; // <--- Вот недостающее поле
};

@Injectable()
export class DocumentAiService implements OnModuleInit {
    private primaryModel: any;
    private fallbackModel: any;
    private vectorStore: MemoryVectorStore;
    private _templateNames: { fileName: string; humanName: string; language: 'ru' | 'kz' }[];
    private currentLanguage: 'ru' | 'kz' = 'ru';

    constructor(
        private readonly configService: ConfigService,
        private readonly chatHistoryService: ChatHistoryService,
        private readonly usersService: UsersService,
        private readonly docxService: DocxService,
        private readonly chatAiService: ChatAiService,
        @InjectRepository(GeneratedDocument)
        private readonly generatedDocRepo: Repository<GeneratedDocument>,

    ) { }

    /**
     * Метод жизненного цикла NestJS. Выполняется один раз при старте приложения.
     * Инициализирует AI-модели, загружает и валидирует шаблоны, создает векторную базу знаний.
     */
    async onModuleInit() {
        console.log('[AI Service] Модуль инициализируется...');
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY не найден в .env файле!');
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        this.primaryModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        this.fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        console.log('[AI Service] Основная и резервная модели Gemini успешно инициализированы.');

        this.loadAndValidateTemplates();
        await this.initializeVectorStore(apiKey);
    }


    /**
     * Загружает информацию о шаблонах из реестра, проверяет их структуру и кэширует для использования.
     */
    private loadAndValidateTemplates() {
        console.log('[AI Service] Загрузка и валидация шаблонов...');
        this._templateNames = [];
        for (const [fileName, details] of Object.entries(TEMPLATES_REGISTRY)) {
            if (!details.name || !details.tags_in_template || !Array.isArray(details.tags_in_template)) {
                console.error(`[AI Service] ОШИБКА КОНФИГУРАЦИИ: Шаблон ${fileName} в templates.registry.ts не имеет поля 'name' или 'tags_in_template'!`);
                continue;
            }
            const language = details.language === 'kz' ? 'kz' : 'ru'; // Гарантируем, что значение будет либо 'ru', либо 'kz'
            this._templateNames.push({
                fileName: fileName.toLowerCase(),
                humanName: details.name,
                language: language,
            });
        }
        console.log(`[AI Service] Загружено и провалидировано ${this._templateNames.length} шаблонов.`);
    }

    private _getFormattedTemplateList(language: 'ru' | 'kz'): string {
        const header = language === 'kz'
            ? "Міне, қолжетімді құжаттар тізімі:"
            : "Вот список доступных документов:";

        const templateList = this._templateNames
            .filter(t => t.language === language) // <-- ДОБАВЛЕНА ЭТА СТРОКА
            .map(t => `\n- ${t.humanName}`)
            .join('');

        return header + templateList;
    }

    private async initializeVectorStore(apiKey: string) {
        console.log('[AI Service] Инициализация векторной базы знаний...');
        try {
            const cacheDir = path.join(process.cwd(), '.pdf-cache');
            if (!fs.existsSync(cacheDir)) {
                console.warn('[AI Service] Папка .pdf-cache не найдена.');
                return;
            }
            const fileNames = fs.readdirSync(cacheDir);
            const documents = fileNames.map(fileName => ({
                pageContent: fs.readFileSync(path.join(cacheDir, fileName), 'utf-8'),
                metadata: { source: fileName.replace('.txt', '') },
            }));
            if (documents.length === 0) { return; }
            const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000, chunkOverlap: 200 });
            const docs = await splitter.splitDocuments(documents);
            console.log(`[AI Service] Документы разделены на ${docs.length} чанков.`);
            const embeddings = new GoogleGenerativeAIEmbeddings({ apiKey, model: "embedding-001", taskType: TaskType.RETRIEVAL_DOCUMENT });
            this.vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
            console.log('[AI Service] Векторная база знаний создана.');
        } catch (error) {
            console.error('[AI Service] Ошибка при инициализации векторной базы:', error);
        }
    }

    private async generateWithRetry(prompt: any, retries = 3): Promise<string> {
        let lastError: any;

        // --- Попытка 1: Основная, самая мощная модель ---
        try {
            console.log(`[AI Service] Обращение к основной модели (gemini-2.0-flash-exp)...`);
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const result = await this.primaryModel.generateContent(prompt);
                    return result.response.text();
                } catch (error) {
                    if (error.status === 503 && attempt < retries) {
                        const waitTime = Math.pow(2, attempt) * 1000; // 2, 4, 8 секунд
                        console.warn(`[AI Service] Основная модель перегружена (503). Повторная попытка через ${waitTime / 1000} сек...`);
                        await delay(waitTime);
                    } else {
                        throw error; // Выбрасываем ошибку, если она не 503 или попытки кончились
                    }
                }
            }
        } catch (error) {
            console.error(`[AI Service] Основная модель не ответила после всех попыток. Ошибка:`, error.message);
            lastError = error;
        }

        // --- Попытка 2: Резервная, более быстрая модель ---
        try {
            console.warn(`[AI Service] Переключаюсь на резервную модель (gemini-2.0-flash-exp)...`);
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    const result = await this.fallbackModel.generateContent(prompt);
                    return result.response.text();
                } catch (error) {
                    if (error.status === 503 && attempt < retries) {
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.warn(`[AI Service] Резервная модель перегружена (503). Повторная попытка через ${waitTime / 1000} сек...`);
                        await delay(waitTime);
                    } else {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error(`[AI Service] Резервная модель также не ответила. Ошибка:`, error.message);
            lastError = error;
        }

        // Если ни одна из моделей не ответила
        throw lastError || new Error('Не удалось получить ответ от AI после всех попыток со всеми моделями.');
    }

    /**
     * Определяет язык текста (русский или казахский) с помощью AI.
     * @param text Входной текст пользователя.
     * @returns 'ru' или 'kz'.
     */
    public async detectLanguage(text: string): Promise<'ru' | 'kz'> {
        // Короткий, быстрый и очень точный промпт
        const prompt = `
      Определи основной язык этого текста: "${text}".
      В ответе верни ТОЛЬКО 'ru' (для русского) или 'kz' (для казахского).
    `;

        try {
            const result = (await this.generateWithRetry(prompt)).trim().toLowerCase();

            if (result === 'kz') {
                return 'kz';
            }
            return 'ru';
        } catch (error) {
            console.error("Ошибка при определении языка:", error);
            return 'ru'; // Безопасный fallback в случае ошибки API
        }
    }

    async processDocumentMessage(prompt: string, user: User): Promise<DocumentProcessingResponse> {
        const userId = user.id;
        const userMessageLanguage = await this.chatAiService.detectLanguage(prompt);

        // БЛОК 1: ПОШАГОВЫЙ ДИАЛОГ
        if (user.doc_chat_template) {
            const allFields = await this.getFieldsForTemplate(user.doc_chat_template);
            const currentIndex = user.doc_chat_question_index || 0;

            // Теперь эта проверка работает, так как userMessageLanguage объявлена выше
            if (currentIndex >= allFields.length) {
                await this.usersService.resetDocChatState(userId);
                return this.handleClarification({ intent: 'clarification_needed' }, userMessageLanguage);
            }

            const currentField = allFields[currentIndex];

            const extractionResult = await this.extractDataForDocx(prompt, user.doc_chat_template, userId, currentField.question, currentField.tag);
            // 1. Пользователь инициирует отмену
            if (extractionResult.intent === 'cancel') {
                // Используем уже существующую userMessageLanguage, НЕ объявляем заново
                const message = userMessageLanguage === 'kz'
                    ? 'Сіз құжатты толтыруды тоқтатқыңыз келетініне сенімдісіз бе? (иә/жоқ)'
                    : 'Вы уверены, что хотите отменить заполнение документа? (да/нет)';

                await this.usersService.updateDocChatState(userId, currentIndex, user.doc_chat_pending_data, 'cancel_pending');
                return { type: 'chat', content: { action: 'clarification', message } };
            }

            // 2. Пользователь отвечает на вопрос об отмене
            if (user.doc_chat_request_id === 'cancel_pending') {
                const confirmationPrompt = `
              Проанализируй ответ пользователя на вопрос о подтверждении. Ответ может быть на русском или казахском языке (включая варианты "иа", "ия", "иә").
              Он выражает согласие/подтверждение?
              Ответ пользователя: "${prompt}"
              Верни только одно слово: "да" если согласие, "нет" если несогласие.
            `;
                const confirmationResult = await this.chatAiService.generateWithRetry(confirmationPrompt);

                // if (confirmationResult.toLowerCase().includes('да')) {
                //     await this.usersService.resetDocChatState(userId);

                //     return this.handleClarification({ intent: 'clarification_needed' }, userMessageLanguage);
                // } else {
                //     await this.usersService.updateDocChatState(userId, currentIndex, user.doc_chat_pending_data, null);
                //     const message = currentField.example
                //         ? `${currentField.question}\n${currentField.example}`
                //         : currentField.question;
                //     return { type: 'chat', content: { action: 'collect_data', message } };
                // }
                if (confirmationResult.toLowerCase().includes('да')) {
                    await this.usersService.resetDocChatState(userId);
                
                    // Явно используем язык, на котором пользователь подтвердил отмену.
                    const responseLanguage = userMessageLanguage;
                
                    // Формируем заголовок на нужном языке.
                    const clarificationMessage = responseLanguage === 'kz'
                        ? 'Қандай құжат керектігін нақтылаңызшы.'
                        : 'Уточните, какой документ вам нужен?';
                
                    // Получаем список документов, отфильтрованный по нужному языку.
                    const templateList = this._getFormattedTemplateList(responseLanguage);
                
                    // Собираем финальное сообщение.
                    const finalMessage = `${clarificationMessage}\n\n${templateList}`;
                
                    // Возвращаем полностью контролируемый нами результат.
                    return { type: 'chat', content: { action: 'clarification', message: finalMessage } };
                }
            }

            // --- КОНЕЦ ЛОГИКИ ОБРАБОТКИ ОТМЕНЫ ---

            if (extractionResult.error) {
                const retryMessage = `${extractionResult.error}\n\n${currentField.question}`;
                return { type: 'chat', content: { action: 'collect_data', message: retryMessage } };
            }

            const currentData = user.doc_chat_pending_data || {};
            const newData = { ...currentData, ...(extractionResult.data || {}) };
            const nextIndex = currentIndex + 1;

            if (nextIndex < allFields.length) {
                await this.usersService.updateDocChatState(userId, nextIndex, newData);
                const nextField = allFields[nextIndex];
                const message = nextField.example ? `${nextField.question}\n${nextField.example}` : nextField.question;
                return { type: 'chat', content: { action: 'collect_data', message } };
            } else {
                let finalData = newData;

                const parseDate = (dateString: string) => {
                    if (!dateString || typeof dateString !== 'string') return { day: '', month: '', year: '' };
                    // Простая регулярка для формата "25 июля 2025" или "25.07.2025"
                    const parts = dateString.match(/(\d{1,2})\s*[\.|\s]\s*([а-яА-Я]+|\d{1,2})\s*[\.|\s]\s*(\d{4})/);
                    if (parts) {
                        return {
                            day: parts[1],
                            month: parts[2],
                            year: parts[3]
                        };
                    }
                    return { day: dateString, month: '', year: '' }; // Fallback
                };

                if (finalData.accepting_party_date) {
                    const parsed = parseDate(finalData.accepting_party_date);
                    finalData = { ...finalData, accepting_party_day: parsed.day, accepting_party_month: parsed.month, accepting_party_year: parsed.year };
                }
                if (finalData.transferring_party_date) {
                    const parsed = parseDate(finalData.transferring_party_date);
                    finalData = { ...finalData, transferring_party_day: parsed.day, transferring_party_month: parsed.month, transferring_party_year: parsed.year };
                }

                console.log('--- FINAL DATA FOR DOCX TEMPLATE ---');
                console.log(JSON.stringify(finalData, null, 2));
                console.log('------------------------------------');

                const docxBuffer = this.docxService.generateDocx(user.doc_chat_template, finalData);
                const fileId = uuidv4();
                
                // Используем временную папку для продакшена или локальную папку для разработки
                const storageDir = process.env.NODE_ENV === 'production' 
                    ? path.join(process.cwd(), 'generated_documents')
                    : `/var/data/render/generated_documents`;
                    
                if (!fs.existsSync(storageDir)) { fs.mkdirSync(storageDir, { recursive: true }); }
                const storagePath = path.join(storageDir, `${fileId}.docx`);
                fs.writeFileSync(storagePath, docxBuffer);
                const newDoc = this.generatedDocRepo.create({ id: fileId, user, originalFileName: user.doc_chat_template, storagePath });
                await this.generatedDocRepo.save(newDoc);

                await this.usersService.resetDocChatState(userId);
                if (user.tariff === 'Базовый') { await this.usersService.setLastGenerationDate(user.id, new Date()); }

                const modelResponseContent = JSON.stringify({ message: `Документ "${user.doc_chat_template}" успешно сгенерирован.`, fileId, fileName: user.doc_chat_template });

                return { type: 'file', content: docxBuffer, fileName: user.doc_chat_template, historyContent: modelResponseContent };
            }
        }
        // БЛОК 2: НАЧАЛО НОВОГО ДИАЛОГА
        const intentResult = await this.findTemplate(prompt);
        if (intentResult.templateName) {
            const allFields = await this.getFieldsForTemplate(intentResult.templateName);
            if (allFields && allFields.length > 0) {
                await this.usersService.startDocChat(user.id, intentResult.templateName);
                const firstField = allFields[0];
                const message = firstField.example ? `${firstField.question}\n${firstField.example}` : firstField.question;
                return { type: 'chat', content: { action: 'collect_data', message } };
            }
        }

        return this.handleClarification(intentResult, userMessageLanguage);
    }

    // Добавьте этот новый вспомогательный метод в класс
    private handleClarification(intentResult: any, language: 'ru' | 'kz'): { type: 'chat', content: any } {
        let message = "";

        const smallTalk = {
            ru: "Здравствуйте! Я ваш ИИ-помощник по документам. Я могу помочь вам создать нужный документ. Всегда напоминаю: если у вас общие вопросы, лучше задать их в 'ИИ-Чате'.",
            kz: "Сәлеметсіз бе! Мен сіздің құжаттар бойынша ЖИ-көмекшіңізбін. Мен сізге қажетті құжатты жасауға көмектесе аламын. Егер жалпы сұрақтарыңыз болса, оларды 'ЖИ-Чат' терезесінде қойғаныңыз жөн."
        };

        const queryRedirect = {
            ru: "Это похоже на общий вопрос. Для консультаций, пожалуйста, воспользуйтесь 'ИИ-Чатом'. Здесь я помогаю только с созданием документов.",
            kz: "Бұл жалпы сұраққа ұқсайды. Кеңес алу үшін 'ЖИ-Чат' терезесін пайдаланыңыз. Мұнда мен тек құжаттарды жасауға көмектесемін."
        };

        if (intentResult.intent === 'query') {
            message = queryRedirect[language];
        } else if (intentResult.intent === 'small_talk') {
            message = smallTalk[language] + "\n\n" + this._getFormattedTemplateList(language);
        } else { // 'clarification_needed', 'cancel', etc.
            message = (intentResult.clarification || (language === 'kz' ? "Қандай құжат керектігін нақтылаңызшы." : "Уточните, какой документ вам нужен?")) + "\n\n" + this._getFormattedTemplateList(language);
        }

        return { type: 'chat', content: { action: 'clarification', message } };
    }

    private async getQuestionsForTemplate(templateName: string): Promise<any> {
        const fields = await this.getFieldsForTemplate(templateName);
        const questions = await this.formatQuestionsForUser(fields, templateName);
        return { action: 'collect_data', templateName, questions };
    }

    private async findTemplate(prompt: string): Promise<{ templateName?: string; intent?: string }> {
        const language = this.detectLanguage(prompt);

        const intentDetectionPrompt = `
  Твоя задача — точно классифицировать "Запрос" пользователя, который хочет работать с документами. Действуй СТРОГО по плану.

  **ПЛАН ДЕЙСТВИЙ:**
  1.  **ЗАПРОС СПИСКА ИЛИ СМЕНА КОНТЕКСТА (ВЫСШИЙ ПРИОРИТЕТ):** Если запрос явно или неявно выражает желание **увидеть список, начать заново или сменить язык** (например, "дай список", "покажи варианты", "какие есть документы?", "на русском плз", "басқа документ керек", "хочу новый документ"), немедленно прекрати анализ и верни JSON: \`{"intent": "clarification_needed"}\`
  
  2.  **ПОИСК КОНКРЕТНОГО ШАБЛОНА:** Если это не запрос списка, проверь, не указан ли в запросе **однозначно ОДИН шаблон** из списка. Если да -> верни JSON с **ИМЕНЕМ ФАЙЛА**: \`{"templateName": "имя_файла_из_списка.docx"}\`
  
  3.  **ОБЩИЙ ВОПРОС НЕ ПО ТЕМЕ:** Если это жалоба или вопрос, не связанный с созданием документов (например, "сосед затопил", "погода хорошая") -> верни JSON: \`{"intent": "query"}\`

  4.  **ПРИВЕТСТВИЕ:** Если это только приветствие ("Привет", "Салем") -> верни JSON: \`{"intent": "small_talk"}\`

  5.  **НЕЯСНОЕ НАМЕРЕНИЕ:** Во всех остальных случаях (если не нашел шаблон, нашел несколько или сомневаешься) -> верни JSON: \`{"intent": "clarification_needed"}\`

  **Список шаблонов (формат: "человеческое имя" (имя файла)):**
  ${this._templateNames.map(t => `* "${t.humanName}" (${t.fileName})`).join('\n')}

  Запрос: "${prompt}"
  Верни ТОЛЬКО JSON.
`;

        const rawResponse = await this.generateWithRetry(intentDetectionPrompt);
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { return { intent: "clarification_needed" }; }
        return JSON.parse(jsonMatch[0]);
    }


    /**
      * Шаг 1: Находит подходящий шаблон и возвращает список вопросов.
      * @param prompt - Запрос пользователя.
      * @param userId - ID пользователя.
      * @returns Объект с вопросами или сообщение с вариантами.
      */
    async startDocumentGeneration(prompt: string, userId: number): Promise<any> {
        const language = this.detectLanguage(prompt);
        const history = await this.chatHistoryService.getHistory(userId, ChatType.DOCUMENT);

        const intentDetectionPrompt = `
      Твоя задача - найти в "Списке шаблонов" тот, который лучше всего соответствует "Запросу пользователя".
      - ЕСЛИ найден ОДИН подходящий шаблон -> верни ТОЛЬКО JSON: {"templateName": "имя_файла.docx"}
      - ЕСЛИ найдено НЕСКОЛЬКО подходящих шаблонов или НЕ НАЙДЕНО НИ ОДНОГО -> верни ТОЛЬКО JSON: {"templateName": null, "clarification": "текст_уточняющего_вопроса_с_вариантами"}
      Список шаблонов:
      ${this._templateNames.map(t => `- "${t.humanName}" (файл: ${t.fileName})`).join('\n')}
      Запрос: "${prompt}"
    `;

        const rawResponse = await this.generateWithRetry(intentDetectionPrompt);
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { throw new Error("Не удалось определить шаблон."); }

        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.templateName) {
            // Если шаблон найден, генерируем вопросы
            const fields = await this.getFieldsForTemplate(parsed.templateName);
            const questions = await this.formatQuestionsForUser(fields, parsed.templateName);
            const responsePayload = { action: 'collect_data', templateName: parsed.templateName, questions };
            await this.chatHistoryService.addMessageToHistory(userId, prompt, JSON.stringify(responsePayload), ChatType.DOCUMENT);
            return responsePayload;
        } else {
            // Если нужна кларификация, возвращаем ее
            const clarification = parsed.clarification || "Уточните, какой документ вам нужен?";
            await this.chatHistoryService.addMessageToHistory(userId, prompt, clarification, ChatType.DOCUMENT);
            return { action: 'clarification', message: clarification };
        }
    }


    /**
     * Анализирует PDF-превью шаблона и генерирует список вопросов для пользователя на нужном языке.
     * @param templateName - Имя файла шаблона.
     * @returns Массив объектов с полями 'tag' (для машины) и 'question' (для человека).
     */
    async getFieldsForTemplate(templateName: string): Promise<{ tag: string; question: string; example?: string }[]> {
        const normalizedTemplateName = templateName.toLowerCase();
        const templateInfo = TEMPLATES_REGISTRY[normalizedTemplateName];
        if (!templateInfo) throw new Error(`Шаблон "${templateName}" не настроен.`);

        // --- НАЧАЛО НОВОЙ ЛОГИКИ ФОРМАТИРОВАНИЯ ---
        // Преобразуем наш структурированный массив в понятный для AI текст
        const formattedTags = templateInfo.tags_in_template.map(element => {
            if (typeof element === 'object' && element.loopName) {
                // Если это объект цикла, описываем его структуру
                return `${element.loopName} (ЦИКЛ, содержащий поля: ${element.loopTags.join(', ')})`;
            }
            // Если это обычная строка, оставляем как есть
            return element as string;
        }).join(', ');
        // --- КОНЕЦ НОВОЙ ЛОГИКИ ФОРМАТИРОВАНИЯ ---

        // Промпт остается большим и универсальным, как вы и хотели.

        const prompt = `
        Твоя главная задача: Проанализировать "Структуру документа" и сгенерировать логичный список вопросов. **ДЛЯ КАЖДОГО ВОПРОСА ТЫ ОБЯЗАН СГЕНЕРИРОВАТЬ РЕАЛИСТИЧНЫЙ ПРИМЕР ОТВЕТА.**
      
        **КРИТИЧЕСКОЕ ПРАВИЛО ЯЗЫКА:** Все вопросы и **ОСОБЕННО ПРИМЕРЫ** должны быть СТРОГО на языке "${templateInfo.language}".
      
        **ПРАВИЛА ГРУППИРОВКИ (ОЧЕНЬ ВАЖНО):**
        Твоя цель — создать минимально возможное количество логичных вопросов. 
        
        1.  **ДАННЫЕ ДЛЯ ЦИКЛОВ/ТАБЛИЦ:** В "Структуре документа" циклы помечены как "(ЦИКЛ, содержащий поля: ...)". Когда ты видишь такую конструкцию, ты должен создать **ОДИН ОБЩИЙ** вопрос для всего цикла.
            *   Тег для JSON: Используй родительский тег цикла (например, 'docs').
            *   Пример вопроса: "Перечислите все передаваемые документы, указывая для каждого его номер, название и примечание."
            *   Пример ответа: "1, Технический паспорт, Копия. 2, Проектная документация, Оригинал."
      
        2.  **ДАННЫЕ ДЛЯ ОБЫЧНЫХ ПОЛЕЙ:** Для всех остальных тегов, которые не являются циклами, создавай отдельные простые вопросы.
      
        **АЛГОРИТМ ДЕЙСТВИЙ:**
        1. Проанализируй "Структуру документа".
        2. Примени "Правила группировки".
        3. **САМОЕ ГЛАВНОЕ:** Для каждой группы тегов сформулируй вежливый и понятный вопрос **И ОБЯЗАТЕЛЬНО** краткий, ясный пример ответа, **строго следуя "ПРАВИЛАМ ФОРМАТИРОВАНИЯ ПРИМЕРОВ"**.
      
        **ПРАВИЛА ФОРМАТИРОВАНИЯ ПРИМЕРОВ (КЛЮЧЕВОЕ ТРЕБОВАНИЕ):**
        1.  **ОБЯЗАТЕЛЬНОСТЬ:** Поле "example" в JSON никогда не должно быть пустым.
        2.  **ФОРМАТ:** **ЗАПРЕЩЕНО использовать любое Markdown-форматирование (\`*\`, \\\` \\\`, \`_\`).** Примеры должны быть **ТОЛЬКО ОБЫЧНЫМ ТЕКСТОМ**.
        3.  **ПРЕФИКС:** Каждый пример должен начинаться со слова "Например: " (для ru) или "Мысалы: " (для kz).
      
        **ФОРМАТ ВЫВОДА:**
        Верни ответ **СТРОГО и ТОЛЬКО в виде JSON-массива** объектов: {"tag": "...", "question": "...", "example": "..."}. 
        **ВАЖНОЕ ПРАВИЛО ВЫВОДА:** Поле "example" ДОЛЖНО БЫТЬ заполнено всегда.
      
        **ИСХОДНЫЕ ДАННЫЕ:**
        **Структура документа (с указанием циклов):**
        ${formattedTags} 
      `;
        // Остальная часть функции остается без изменений
        const pdfPreviewPath = path.join(process.cwd(), 'knowledge_base', 'templates', 'pdf_previews', normalizedTemplateName.replace('.docx', '.pdf'));
        if (!fs.existsSync(pdfPreviewPath)) console.warn(`Внимание: PDF-превью для шаблона "${normalizedTemplateName}" не найдено.`);

        const modelInput: Part[] = [{ text: prompt }];
        if (fs.existsSync(pdfPreviewPath)) {
            const pdfBuffer = fs.readFileSync(pdfPreviewPath);
            const base64Pdf = pdfBuffer.toString('base64');
            modelInput.push({ inlineData: { mimeType: 'application/pdf', data: base64Pdf } });
        }

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const result = await this.generateWithRetry(modelInput);
                const jsonMatch = result.match(/\[[\s\S]*?\]/);
                if (jsonMatch && jsonMatch[0]) {
                    return JSON.parse(jsonMatch[0]);
                }
                throw new Error('Valid JSON array not found in AI response.');
            } catch (error) {
                console.error(`[AI Service] Попытка ${attempt} не удалась при анализе шаблона ${templateName}. Ошибка:`, error.message);
                if (attempt === 3) throw new Error(`Не удалось сгенерировать вопросы для документа: ${templateName}.`);
                await delay(500);
            }
        }
        throw new Error('Не удалось сгенерировать вопросы после всех попыток.');
    }

    /**
  * Форматирует JSON-массив вопросов в красивый, читаемый текст для отображения пользователю.
  * @param fields - Массив вопросов, сгенерированный getFieldsForTemplate.
  * @param templateName - Имя файла шаблона для получения его "человеческого" названия.
  * @returns Единая форматированная строка с вопросами.
  */
    async formatQuestionsForUser(fields: any[], templateName: string): Promise<string> {
        const templateHumanName = TEMPLATES_REGISTRY[templateName.toLowerCase()]?.name || templateName;
        const language = TEMPLATES_REGISTRY[templateName.toLowerCase()]?.language || 'ru';

        const title = language === 'kz'
            ? `"${templateHumanName}" құжатын толтыру үшін келесі ақпарат қажет:`
            : `Для заполнения документа "${templateHumanName}" потребуется следующая информация:`;

        // 1. Берем готовый массив `fields`
        // 2. Проходим по нему циклом `map`
        const questionsText = fields.map((field, index) => {
            // 3. Для каждого элемента создаем строку в нужном формате
            let questionBlock = `${index + 1}. ${field.question}`;
            if (field.example) {
                const exampleLabel = language === 'kz' ? 'Мысалы' : 'Например';
                questionBlock += `\n   *${exampleLabel}: ${field.example}*`;
            }
            return questionBlock;
        }).join('\n\n'); // 4. Соединяем все строки в один большой текст

        // 5. Возвращаем готовую отформатированную строку
        return `${title}\n\n${questionsText}`;
    }

    async extractDataForDocx(
        userAnswersPrompt: string,
        templateName: string,
        userId: number,
        currentQuestion?: string,
        currentTag?: string,
    ): Promise<{ data?: any; intent?: string; error?: string }> {
        const normalizedTemplateName = templateName.toLowerCase();
        const templateInfo = TEMPLATES_REGISTRY[normalizedTemplateName];
        if (!templateInfo) throw new Error(`Шаблон "${templateName}" не настроен.`);

        const element = templateInfo.tags_in_template.find(t => (typeof t === 'string' && t === currentTag) || (typeof t === 'object' && t.loopName === currentTag));
        const language = templateInfo.language;

        // --- НАЧАЛО МОДИФИЦИРОВАННОГО ПРОМПТА ---

        let prompt = `
          Твоя задача — проанализировать "Ответ пользователя" и вернуть результат в виде JSON. Действуй строго по плану.
    
          **Контекст:**
          - Язык для генерации сообщений: ${language}
          - Вопрос, который был задан: "${currentQuestion}"
          - Ответ пользователя: "${userAnswersPrompt}"
    
          **ПЛАН ДЕЙСТВИЙ:**
          1.  **ПРОВЕРКА НА ОТМЕНУ (ВЫСШИЙ ПРИОРИТЕТ):** Сначала проверь, не выражает ли ответ явный отказ, нежелание продолжать или просьбу начать заново (например, "отмена", "не хочу", "давай другой", "не надо", "керек емес", "бас тартамын"). Если да, немедленно прекрати анализ и верни ТОЛЬКО следующий JSON:
              \`{"intent": "cancel"}\`
          
          2.  **ИЗВЛЕЧЕНИЕ ДАННЫХ:** Если это не отмена, попробуй извлечь данные.`;

        if (typeof element === 'object' && element.loopName) {
            // Дополняем промпт инструкциями для циклов
            prompt += `
              *   **Правило для цикла:** Преобразуй ответ в **массив JSON-объектов**. Каждый элемент, перечисленный пользователем, должен стать отдельным объектом. Поля в объекте должны соответствовать: ${element.loopTags.join(', ')}.
              *   **Пример:** Для полей ['index', 'name', 'notes'] и ответа "1. Паспорт, копия. 2. Проект, оригинал", результат должен быть:
                  \`{"data": {"${element.loopName}": [{"index": "1", "name": "Паспорт", "notes": "копия"}, {"index": "2", "name": "Проект", "notes": "оригинал"}]}}\`
            `;
        } else {
            // Дополняем промпт инструкциями для обычных полей
            prompt += `
              *   **Правило для обычного поля:** Извлеки всю релевантную информацию из ответа и верни ее как **единую строку**.
              *   **Результат:** \`{"data": {"${currentTag}": "извлеченное значение"}}\`
            `;
        }

        prompt += `
          3.  **ПРОВЕРКА НА РЕЛЕВАНТНОСТЬ:** Если ответ не является отменой и из него невозможно извлечь осмысленные данные (ответ не по теме), верни JSON с сообщением об ошибке **на ${language} языке**.
              *   **Результат:** \`{"error": "Вежливое сообщение об ошибке на ${language} языке, просящее повторить ввод."}\`
    
          **ВАЖНО:** Возвращай только JSON, без лишних слов и объяснений.`;
        // --- КОНЕЦ МОДИФИЦИРОВАННОГО ПРОМПТА ---

        try {
            const rawResponse = await this.generateWithRetry(prompt);
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { error: "Внутренняя ошибка: AI не вернул JSON." };
            }
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            return { error: "Критическая ошибка при обработке запроса." };
        }
    }
    async getGeneratedDocument(fileId: string, userId: number): Promise<GeneratedDocument | null> {
        return this.generatedDocRepo.findOne({
            where: {
                id: fileId,
                user: { id: userId } // Проверяем, что документ принадлежит именно этому пользователю
            }
        });
    }
}
