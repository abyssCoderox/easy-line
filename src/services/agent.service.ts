import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { createAgent } from 'langchain';
import { config } from '../config';
import { tools, setTaskContext } from './tools';
import { logger } from './logger.service';

const SYSTEM_PROMPT = `你是一个智能运维助手，可以帮助用户：

1. 管理定时任务（创建、查看、删除、启用、禁用）
2. 查询系统告警信息
3. 查询设备运行状态
4. 搜索互联网获取实时信息
5. 进行日常对话

工具使用指南：
- 用户想设置提醒或定时通知时，使用 create_task 工具
- 用户想查看任务列表时，使用 list_tasks 工具
- 用户想删除任务时，使用 delete_task 工具（需要任务ID）
- 用户想启用/禁用任务时，使用 enable_task 或 disable_task 工具
- 用户想查看告警时，使用 alert_query 工具
- 用户想查看设备状态时，使用 device_status 工具
- 用户需要搜索实时信息、最新新闻、联网查询时，使用 web_search 工具

回复规则：
- 执行工具后，将结果以清晰友好的方式呈现给用户
- 搜索结果：总结关键信息，列出信息来源
- 告警信息：显示级别emoji、设备、描述、时间
- 任务信息：显示任务名称、执行时间、下次执行时间
- 如果工具执行失败，告诉用户稍后重试
- 普通对话时，友好地回复用户`;

export class AgentService {
  private model: ChatOpenAI;
  private agent: Awaited<ReturnType<typeof createAgent>> | null = null;
  private sessions: Map<string, InMemoryChatMessageHistory> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.model = new ChatOpenAI({
      model: config.llm.model,
      temperature: config.llm.temperature ?? 0.7,
      apiKey: config.llm.apiKey,
      timeout: config.llm.timeout ?? 30000,
      configuration: config.llm.apiBaseUrl ? {
        baseURL: config.llm.apiBaseUrl,
      } : undefined,
    });

    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.agent = await createAgent({
      model: this.model,
      tools,
      systemPrompt: SYSTEM_PROMPT,
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private getOrCreateHistory(userId: string): InMemoryChatMessageHistory {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new InMemoryChatMessageHistory());
    }
    return this.sessions.get(userId)!;
  }

  async run(input: string, userId: string): Promise<string> {
    await this.ensureInitialized();
    
    setTaskContext(userId);
    
    const history = this.getOrCreateHistory(userId);
    const pastMessages = await history.getMessages();

    const messages = [
      ...pastMessages.map(msg => ({
        role: msg._getType() === 'human' ? 'user' as const : 'assistant' as const,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      { role: 'user' as const, content: input },
    ];

    try {
      const result = await this.agent!.invoke({
        messages,
      });

      const lastMessage = result.messages[result.messages.length - 1];
      const response = typeof lastMessage.content === 'string' 
        ? lastMessage.content 
        : JSON.stringify(lastMessage.content);

      await history.addMessage(new HumanMessage(input));
      await history.addMessage(new AIMessage(response));

      await this.trimHistory(userId);

      logger.info('HTTP', 'Agent response generated', {
        userId: this.maskUserId(userId),
        inputLength: input.length,
        outputLength: response.length,
      });

      return response;
    } catch (error: any) {
      logger.error('HTTP', 'Agent execution failed', {
        userId: this.maskUserId(userId),
        error: error.message,
      });

      return this.getFallbackResponse();
    }
  }

  private async trimHistory(userId: string): Promise<void> {
    const history = this.sessions.get(userId);
    if (!history) return;

    const messages = await history.getMessages();
    const maxLength = (config.llm.maxHistoryLength ?? 6) * 2;

    if (messages.length > maxLength) {
      const newHistory = new InMemoryChatMessageHistory();
      const messagesToKeep = messages.slice(-maxLength);
      for (const msg of messagesToKeep) {
        await newHistory.addMessage(msg);
      }
      this.sessions.set(userId, newHistory);
    }
  }

  clearHistory(userId: string): void {
    this.sessions.delete(userId);
    logger.info('HTTP', 'Session cleared', {
      userId: this.maskUserId(userId),
    });
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private getFallbackResponse(): string {
    const fallbacks = [
      '抱歉，处理您的请求时遇到问题，请稍后再试。',
      '系统繁忙，请稍后再试。',
      '我遇到了一些问题，请稍后再问我。',
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  private maskUserId(userId: string): string {
    if (userId.length <= 8) return '***';
    return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
  }
}

export const agentService = new AgentService();
