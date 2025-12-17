import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Content, TaskType } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

import { Document } from 'langchain/document';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// ⚠️ Если у вас langchain >= 0.2.x:
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
// ⚠️ Если langchain < 0.2.x, замените импорт выше на:
// import { HNSWLib } from 'langchain/vectorstores/hnswlib';

import { ChatHistoryService } from '../chat/history/history.service';
import { TEMPLATES_REGISTRY } from './templates.registry';
import { ChatType } from '../chat/entities/chat-message.entity';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type Lang = 'ru' | 'kz';

@Injectable()
export class ChatAiService implements OnModuleInit {
    private readonly logger = new Logger(ChatAiService.name);
    private primaryModel: any;
    private fallbackModel: any;
    private vectorStore: HNSWLib | null = null;
    private embeddings: GoogleGenerativeAIEmbeddings;
    private allDocs: Document[] = [];
    private _templateNames: { fileName: string; humanName: string }[] = [];
    private currentLanguage: Lang = 'ru';
    private readonly TEXT_CACHE_DIR = path.join(process.cwd(), '.pdf-cache');
    private readonly INDEX_DIR = path.join(process.cwd(), '.rag-index');
    private readonly RAG_CHUNK_SIZE = 900;
    private readonly RAG_CHUNK_OVERLAP = 420;
    private readonly RAG_VECTOR_TOPK = 480;
    private readonly RAG_HARD_CONTEXT_LIMIT = 400000;
    
    // СПИСОК КЛЮЧЕВЫХ СЛОВ (Оставляем как был)
    private readonly keywordToFileMap = [
        { "keywords": ["определение", "термин", "что такое", "понятие", "означает"], "files": ["СТ РК 2966-2023.pdf.txt", "Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt"] },
        { "keywords": ["капитальный ремонт", "капремонт", "модернизация", "реконструкция"], "files": ["СТ РК 2978-2023 Жилищно-коммунальное хозяйство. Проведение капитального ремонта общего имущества объекта кондоминиума. Общие тре.pdf.txt", "Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt", "СТ РК 2979-2017.pdf.txt"] },
        { "keywords": ["текущий ремонт", "косметический ремонт"], "files": ["СТ РК 2864-2016.pdf.txt", "Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt", "СТ РК 2979-2017.pdf.txt"] },
        { "keywords": ["технический осмотр", "обследование", "мониторинг", "техническое состояние", "аварийное состояние", "износ"], "files": ["СТ РК 2979-2017.pdf.txt", "СТ РК 2966-2023.pdf.txt"] },
        { "keywords": ["мусор", "отходы", "тбо", "кго", "вывоз отходов", "сбор мусора", "контейнер", "свалка"], "files": ["СТ РК 2862-2023 Жилищно-коммунальное хозяйство. Сбор и вывоз твердых бытовых отходов. Общие требования.pdf.txt"] },
        { "keywords": ["отопление", "теплоснабжение", "горячая вода", "гвс", "теплоноситель", "итп", "температура в квартире"], "files": ["СТ РК 2863-2016.pdf.txt"] },
        { "keywords": ["электричество", "электроснабжение", "электрооборудование", "счетчик", "щиток", "вру"], "files": ["СТ РК 2973-2017.pdf.txt"] },
        { "keywords": ["диспетчер", "аварийная служба", "авария", "заявка", "устранение аварии"], "files": ["СТ РК 2975-2017.pdf.txt"] },
        { "keywords": ["содержание", "уборка", "санитарное содержание", "обслуживание"], "files": ["СТ РК 2976-2023.pdf.txt", "СТ РК 2970-2023 Жилищно-коммунальное хозяйство. Управление объектом кондоминиума. Общие требования.pdf.txt"] },
        { "keywords": ["управление", "оси", "ксκ", "кск", "собрание собственников", "протокол собрания", "совет дома", "председатель", "форма управления"], "files": ["Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt", "СТ РК 2970-2023 Жилищно-коммунальное хозяйство. Управление объектом кондоминиума. Общие требования.pdf.txt"] },
        { "keywords": ["взносы", "оплата", "тариф", "текущие взносы", "накопительные взносы", "целевые взносы", "задолженность"], "files": ["Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt"] },
        { "keywords": ["коммунальные услуги", "поставщик", "ресурсоснабжающая организация"], "files": ["СТ РК 2967-2023.pdf.txt", "Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt"] },
        { "keywords": ["техническая документация", "паспорт дома", "акт приема-передачи", "исполнительная документация"], "files": ["СТ РК 2970-2023 Жилищно-коммунальное хозяйство. Управление объектом кондоминиума. Общие требования.pdf.txt", "СТ РК 2864-2016.pdf.txt", "СТ РК 2978-2023 Жилищно-коммунальное хозяйство. Проведение капитального ремонта общего имущества объекта кондоминиума. Общие тре.pdf.txt"] },
        { "keywords": ["стабильность", "устойчивость", "оценка зданий", "критерии", "показатели", "бенчмаркинг", "iso 21678"], "files": ["ҚР СТ ISO 21678-2023.pdf.txt"] },
        { "keywords": ["реестр", "список стандартов", "перечень стандартов", "ст рк"], "files": ["Реестр стандартов.pdf.txt"] },
        { "keywords": ["кондоминиум", "общее имущество", "обязанности собственника", "права собственника"], "files": ["Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt", "СТ РК 2970-2023 Жилищно-коммунальное хозяйство. Управление объектом кондоминиума. Общие требования.pdf.txt", "СТ РК 2966-2023.pdf.txt"] },
    ];

    private readonly BASE_LAW_FILES = [
        'Закон Республики Казахстан от 15 июля 2025 года № 207-VIII О внесении изменений и дополнений в некоторые законодательные акты.pdf.txt',
    ];

    constructor(
        private readonly configService: ConfigService,
        private readonly chatHistoryService: ChatHistoryService,
    ) { }

    async onModuleInit() {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) throw new Error('GEMINI_API_KEY отсутствует в .env');

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // 👇 ЗДЕСЬ ИЗМЕНЕНИЯ: Добавили -001 для стабильности
        this.primaryModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-001' });
        this.fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-001' });

        this.embeddings = new GoogleGenerativeAIEmbeddings({
            apiKey,
            model: 'embedding-001',
            taskType: TaskType.RETRIEVAL_DOCUMENT,
        });

        this.loadAndValidateTemplates();
        await this.initializeVectorStorePersistent();
    }

    private async initializeVectorStore() {
        this.logger.log('Инициализация векторного хранилища...');
        if (!fs.existsSync(this.INDEX_DIR)) fs.mkdirSync(this.INDEX_DIR, { recursive: true });

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.RAG_CHUNK_SIZE,
            chunkOverlap: this.RAG_CHUNK_OVERLAP,
            separators: ["\n\nСтатья", "\n\nРаздел", "\n\nОпределение", "\n\n", "\n", ". "],
        });

        const allFiles = fs.readdirSync(this.TEXT_CACHE_DIR).filter(f => f.endsWith('.txt'));
        const rawDocs = allFiles.map(file => new Document({
            pageContent: fs.readFileSync(path.join(this.TEXT_CACHE_DIR, file), 'utf-8'),
            metadata: { source: file }
        }));

        let chunkedDocs: Document[] = [];
        for (const doc of rawDocs) {
            const parts = await splitter.splitDocuments([doc]);
            parts.forEach((p, idx) => {
                p.metadata = { ...p.metadata, chunkIndex: idx };
                chunkedDocs.push(p);
            });
        }
        this.allDocs = chunkedDocs;

        if (fs.existsSync(path.join(this.INDEX_DIR, 'docstore.json'))) {
            this.logger.log('Загрузка существующего индекса с диска...');
            this.vectorStore = await HNSWLib.load(this.INDEX_DIR, this.embeddings);
        } else {
            this.logger.log(`Создание нового индекса из ${this.allDocs.length} чанков...`);
            this.vectorStore = await HNSWLib.fromDocuments(this.allDocs, this.embeddings);
            await this.vectorStore.save(this.INDEX_DIR);
        }
        this.logger.log('Векторное хранилище готово.');
    }

    private loadAndValidateTemplates() {
        this._templateNames = [];
        for (const [fileName, details] of Object.entries(TEMPLATES_REGISTRY)) {
            if (!details.name || !Array.isArray(details.tags_in_template)) continue;
            this._templateNames.push({ fileName: fileName.toLowerCase(), humanName: details.name });
        }
    }

    private async initializeVectorStorePersistent() {
        if (!fs.existsSync(this.TEXT_CACHE_DIR)) {
            throw new Error(`.pdf-cache не найден: ${this.TEXT_CACHE_DIR}`);
        }
        if (!fs.existsSync(this.INDEX_DIR)) {
            fs.mkdirSync(this.INDEX_DIR, { recursive: true });
        }

        const fileNames = fs.readdirSync(this.TEXT_CACHE_DIR).filter(f => f.endsWith('.txt'));
        if (fileNames.length === 0) {
            throw new Error('[RAG] .pdf-cache пуст — нет данных для индексации');
        }

        const rawDocs: Document[] = fileNames.map(fileName => ({
            pageContent: fs.readFileSync(path.join(this.TEXT_CACHE_DIR, fileName), 'utf-8'),
            metadata: { source: fileName },
        }));

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 350,
            separators: ['\n\n', '\n', '. '],
        });

        const chunkedDocs: Document[] = [];
        for (const doc of rawDocs) {
            const parts = await splitter.splitDocuments([doc]);
            parts.forEach((p, idx) => {
                p.metadata = { ...(p.metadata || {}), chunkIndex: idx };
                chunkedDocs.push(p);
            });
        }
        this.allDocs = chunkedDocs;

        const indexMetaPath = path.join(this.INDEX_DIR, 'hnswlib.index');
        if (fs.existsSync(indexMetaPath)) {
            try {
                console.log('[RAG] Загрузка существующего индекса...');
                this.vectorStore = await HNSWLib.load(this.INDEX_DIR, this.embeddings);
                return;
            } catch (e) {
                console.warn('[RAG] Не удалось загрузить существующий индекс, пересобираем...', e);
            }
        }

        console.log('[RAG] Создание и сохранение нового индекса...');
        this.vectorStore = await HNSWLib.fromDocuments(this.allDocs, this.embeddings);
        await this.vectorStore.save(this.INDEX_DIR);
    }

    async getChatAnswer(prompt: string, userId: number): Promise<string> {
        if (await this.isDocumentRequest(prompt)) {
            const language = await this.detectLanguage(prompt);
            const msg = language === 'kz' ? "Әрине! Құжаттарды жасау үшін бізде 'ЖИ-Құжаттар' арнайы бөлімі бар..." : "Конечно! Для создания документов у нас есть раздел 'ИИ-Документы'...";
            await this.chatHistoryService.addMessageToHistory(userId, prompt, msg, ChatType.GENERAL);
            return msg;
        }

        const language = await this.detectLanguage(prompt);
        const history = await this.chatHistoryService.getHistory(userId, ChatType.GENERAL);

        if (this.isGreeting(prompt, history)) {
            const msg = language === 'kz' ? "Сәлеметсіз бе! Мен — NeoOSI..." : "Здравствуйте! Я — NeoOSI...";
            await this.chatHistoryService.addMessageToHistory(userId, prompt, msg, ChatType.GENERAL);
            return msg;
        }

        let mappedFiles = this._getRelevantSourceFiles(prompt);
        if (this.isLegalQuestion(prompt) || this.isDefinitionQuestion(prompt)) {
            mappedFiles = [...new Set([...mappedFiles, ...this.BASE_LAW_FILES])];
            this.logger.log(`Вопрос определен как юридический/определяющий. Добавлены базовые законы.`);
        }

        const docsForSearch = mappedFiles.length > 0
            ? this.allDocs.filter(d => mappedFiles.includes(d.metadata.source as string))
            : this.allDocs;
        this.logger.log(`Поиск будет произведен по ${docsForSearch.length} чанкам из ${mappedFiles.length > 0 ? mappedFiles.length : 'всех'} документов.`);

        const retrievedDocs = await this._getRelevantDocsAccurate(prompt, this.RAG_VECTOR_TOPK, docsForSearch); 

        const context = this._buildContext(retrievedDocs);
        const answer = await this._generateFinalAnswer(prompt, context, language);

        await this.chatHistoryService.addMessageToHistory(userId, prompt, answer, ChatType.GENERAL);
        return answer;
    }

    private async _getRelevantDocs(question: string, docsForSearch: Document[]): Promise<Document[]> {
        if (!this.vectorStore) return [];

        const terms = this._extractSearchTerms(question);
        const dynamicTopK = Math.max(240, terms.length * 120);

        const { strong, weak } = this._keywordSearch(terms, docsForSearch);
        const vectorResults = await this.vectorStore.similaritySearch(question, dynamicTopK);
        const vectorSources = new Set(docsForSearch.map(d => d.metadata.source));
        const filteredVector = vectorResults.filter(doc => vectorSources.has(doc.metadata.source));
        const combined = [...new Set([...strong, ...weak, ...filteredVector])];
        if (combined.length === 0) {
            this.logger.warn(`[RAG] Zero hits for query: "${question}".`);
            return [];
        }

        const sources = new Set(combined.map(d => d.metadata.source as string));
        const expanded = this.allDocs.filter(d => sources.has(d.metadata.source as string));
        return expanded;
    }

    private _buildContext(docs: Document[]): string {
        if (docs.length === 0) return 'НЕТ РЕЛЕВАНТНЫХ ДАННЫХ';
        const context = docs.map(d => `ИСТОЧНИК: ${d.metadata.source}\n${d.pageContent}`).join('\n\n---\n\n');
        if (context.length > this.RAG_HARD_CONTEXT_LIMIT) {
            return context.slice(0, this.RAG_HARD_CONTEXT_LIMIT) + "\n... (контекст был сокращен)";
        }
        return context;
    }

    private _extractSearchTerms(question: string): string[] {
        return question.toLowerCase()
            .replace(/[^а-яa-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !['что', 'такое', 'какие', 'где', 'как', 'это', 'для', 'или'].includes(w));
    }

    private _keywordSearch(terms: string[], docs: Document[]): { strong: Document[], weak: Document[] } {
        if (terms.length === 0) return { strong: [], weak: [] };
        const strong = docs.filter(d => terms.every(t => d.pageContent.toLowerCase().includes(t)));
        const weak = docs.filter(d => terms.some(t => d.pageContent.toLowerCase().includes(t)));
        return { strong, weak };
    }

    private _isLegalQuestion(prompt: string): boolean {
        return /обязанности|права|согласно|закон|стандарт/i.test(prompt);
    }

    private extractSearchTerms(question: string): string[] {
        const q = question.toLowerCase();
        const quoted = [...q.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(Boolean);
        const tokens = q.replace(/[^а-яa-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && w.length > 3 && !['что', 'такое', 'какие', 'где', 'как', 'это', 'для', 'или'].includes(w));
        return Array.from(new Set([...quoted, ...tokens].filter(Boolean)));
    }

    private keywordSearch(terms: string[], docs: Document[]) {
        if (terms.length === 0) return { strong: [] as Document[], weak: [] as Document[] };
        const strong: Document[] = [], weak: Document[] = [];
        for (const d of docs) {
            const text = d.pageContent.toLowerCase();
            if (terms.every(t => text.includes(t))) strong.push(d);
            else if (terms.some(t => text.includes(t))) weak.push(d);
        }
        return { strong, weak };
    }

    private mergeAndRankResults(kwStrong: Document[], kwWeak: Document[], vec: Document[]): Document[] {
        const seen = new Set<string>();
        const key = (d: Document) => d.pageContent;
        const merged: Document[] = [];
        const push = (arr: Document[]) => {
            for (const d of arr) {
                const k = key(d);
                if (!seen.has(k)) {
                    merged.push(d);
                    seen.add(k);
                }
            }
        };
        push(kwStrong);
        push(kwWeak);
        push(vec);
        return merged;
    }

    private async _getRelevantDocsAccurate(question: string, topK: number, docsForSearch: Document[]): Promise<Document[]> {
        if (!this.vectorStore || docsForSearch.length === 0) return [];

        const terms = this.extractSearchTerms(question);
        const { strong, weak } = this.keywordSearch(terms, docsForSearch);

        // 1. Векторный поиск по ВСЕМУ индексу
        const queryEmbedding = await this.embeddings.embedQuery(question);
        const vectorResultsWithScore = await this.vectorStore.similaritySearchVectorWithScore(queryEmbedding, topK * 2);

        // 2. Фильтруем результаты, оставляя только те, что из нужных нам документов
        const docsForSearchSources = new Set(docsForSearch.map(d => d.metadata.source));
        const filteredVectorResults = vectorResultsWithScore.filter(([doc, _score]) =>
            docsForSearchSources.has(doc.metadata.source)
        );

        // 3. Объединяем результаты
        const combined = this.mergeAndRankResults(strong, weak, filteredVectorResults.map(([doc, _score]) => doc));

        if (combined.length === 0) return [];

        // 4. Расширяем до целых документов
        const sources = Array.from(new Set(combined.map(d => d.metadata.source as string)));
        const expanded = this.allDocs.filter(d => sources.includes(d.metadata.source as string));

        const bySourceThenChunk = (a: Document, b: Document) => {
            if (a.metadata.source !== b.metadata.source) return String(a.metadata.source).localeCompare(String(b.metadata.source));
            return (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0);
        };
        return expanded.sort(bySourceThenChunk);
    }

    private async _generateFinalAnswer(prompt: string, context: string, language: Lang): Promise<string> {
        const advisoryRu = 'В моей базе знаний нет точной информации по этому вопросу, однако, основываясь на общих знаниях и законодательстве, могу порекомендовать следующее:';
        const advisoryKz = 'Менің білім қорымда бұл сұрақ бойынша нақты ақпарат жоқ, алайда, жалпы білім мен заңнамаға сүйене отырып, келесіні ұсына аламын:';

        const finalPrompt = `
    Ты - "NeoOSI", экспертный AI-ассистENT, специализирующийся на вопросах ОСИ и ЖКХ в Казахстане.
    
    **ПРИКАЗ №1: ОТВЕТ ПО ДОКУМЕНТАМ (ВЫСШИЙ ПРИОРИТЕТ)**
    - Если "Контекст из документов" НЕ является "НЕТ РЕЛЕВАНТНЫХ ДАННЫХ", твой ответ должен быть на 100% основан на этом контексте.
    - Обязательно цитируй и ссылайся на источник (например, "Согласно СТ РК 2862-2023...").
    
    **ПРИКАЗ №2: ПЛАН "Б" - ЭКСПЕРТНЫЙ СОВЕТ**
    - Если "Контекст из документов" РАВЕН "НЕТ РЕЛЕВАНТНЫХ ДАННЫХ", переходи к этому плану.
    - Начни свой ответ с ОБЯЗАТЕЛЬНОЙ фразы: "${language === 'kz' ? advisoryKz : advisoryRu}"
    - После этой фразы дай максимально развернутый, полезный и безопасный совет, используя свои общие знания. Структурируй ответ по шагам.
    
    **ОБЩИЕ ПРАВИЛА:**
    - **ЯЗЫК:** Твой ответ ДОЛЖЕН БЫТЬ СТРОГО на том же языке, на котором написан "Вопрос пользователя" (${language}).
    - **ФОРМАТ:** ЗАПРЕЩЕНО использовать Markdown (*, **, #). Только чистый текст и переносы строк.
    
    ---
    **РАЗВЕДДАННЫЕ:**
    
    **Контекст из документов:**
    ${context}
    
    **Вопрос пользователя:**
    "${prompt}"
    `.trim();

        const rawAnswer = await this.generateWithRetry(finalPrompt);
        return rawAnswer.replace(/[*#_`~]/g, '');
    }

    private _getRelevantSourceFiles(question: string): string[] {
        const lower = question.toLowerCase();
        const matched = new Set<string>();
        for (const rule of this.keywordToFileMap) {
            if (rule.keywords.some(kw => lower.includes(kw))) {
                rule.files.forEach(f => matched.add(f));
            }
        }
        return Array.from(matched);
    }

    private async isDocumentRequest(prompt: string): Promise<boolean> {
        const intentPrompt = `
          Проанализируй "Запрос пользователя". Он хочет СОЗДАТЬ, СДЕЛАТЬ или ОФОРМИТЬ новый документ (акт, справку, заявление и т.д.)? Или он просто СПРАШИВАЕТ информацию о документах (какие нужны, как выглядят и т.д.)?
    
          Правила:
          - Если он хочет СОЗДАТЬ документ -> ответь "ДА".
          - Если он просто СПРАШИВАЕТ -> ответь "НЕТ".
          - "Дай мне список документов" — это СПРАШИВАЕТ.
          - "Какие документы нужны?" — это СПРАШИВАЕТ.
          - "Хочу оформить акт" — это СОЗДАТЬ.
    
          Запрос пользователя: "${prompt}"
          
          Твой ответ должен быть ТОЛЬКО ОДНИМ СЛОВОМ: ДА или НЕТ.
        `;

        try {
            const result = await this.generateWithRetry(intentPrompt);
            return /да/i.test(result.trim());
        } catch (error) {
            this.logger.error("Ошибка при определении намерения создать документ:", error);
            return false;
        }
    }
    private isGreeting(prompt: string, history: Content[]): boolean { return /^(привет|сәлем|hello|здравствуйте)$/i.test(prompt.trim()) && history.length < 2; }
    private isLegalQuestion(prompt: string): boolean { return /обязанности|права|ответственность|согласно|закон|стандарт|термин/i.test(prompt); }
    private isDefinitionQuestion(prompt: string): boolean { return /что такое|определение|понятие|означает/i.test(prompt); }

    public async detectLanguage(text: string): Promise<Lang> {
        const prompt = `
    Твоя задача — точно определить основной язык текста.
    **Текст для анализа:** "${text}"
    **Твой ответ должен быть ТОЛЬКО ОДНИМ СЛОВОМ:** 'ru' или 'kz'.
    `.trim();

        try {
            const result = (await this.generateWithRetry(prompt)).trim().toLowerCase();
            this.logger.debug(`Language detected for "${text}": ${result}`);
            return result === 'kz' ? 'kz' : 'ru';
        } catch (error) {
            this.logger.error(`Ошибка при определении языка для текста: "${text}"`, error);
            return 'ru';
        }
    }

    public async generateWithRetry(prompt: string, history: Content[] = [], retries = 3): Promise<string> {
        const model = history.length > 0 ? this.primaryModel : this.fallbackModel;
        for (let i = 0; i < retries; i++) {
            try {
                const chat = model.startChat({ history });
                const res = await chat.sendMessage(prompt);
                return res.response.text();
            } catch (err: any) {
                if (err?.status === 503 && i < retries - 1) {
                    const wait = Math.pow(2, i) * 1000;
                    console.warn(`[AI Service] Модель перегружена (503). Попытка через ${wait / 1000} сек...`);
                    await delay(wait);
                    continue;
                }
                if (i === retries - 1 && model !== this.fallbackModel) {
                    console.warn('[AI Service] Основная модель не ответила. Переключаюсь на резервную...');
                    try {
                        const fb = this.fallbackModel.startChat({ history });
                        const r2 = await fb.sendMessage(prompt);
                        return r2.response.text();
                    } catch (e2) {
                        console.error('[AI Service] Резервная модель также не ответила.', e2);
                        throw e2;
                    }
                }
                throw err;
            }
        }
        throw new Error('generateWithRetry: не удалось получить ответ от AI после всех попыток.');
    }

    public async rebuildIndex(): Promise<void> {
        if (fs.existsSync(this.INDEX_DIR)) {
            fs.rmSync(this.INDEX_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(this.INDEX_DIR, { recursive: true });
        await this.initializeVectorStorePersistent();
    }
}
