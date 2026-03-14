import { ChatOpenAI } from '@langchain/openai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { config } from '../config';
import { LLMConfig, ChatMessage, IntentResult } from '../types';

export class LLMService {
  private model: ChatOpenAI;
  private sessions: Map<string, InMemoryChatMessageHistory> = new Map();
  private readonly llmConfig: LLMConfig;

  constructor() {
    this.llmConfig = config.llm;
    this.model = this.createModel();
  }

  private createModel(): ChatOpenAI {
    const modelConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
      model: this.llmConfig.model,
      temperature: this.llmConfig.temperature,
      maxTokens: this.llmConfig.maxTokens,
      apiKey: this.llmConfig.apiKey,
      timeout: this.llmConfig.timeout,
      maxRetries: 0,
    };

    if (this.llmConfig.apiBaseUrl) {
      modelConfig.configuration = {
        baseURL: this.llmConfig.apiBaseUrl,
      };
    }

    return new ChatOpenAI(modelConfig);
  }

  async chat(userId: string, message: string): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.llmConfig.maxRetries!; attempt++) {
      try {
        const history = this.getOrCreateHistory(userId);
        
        const pastMessages = await history.getMessages();
        const messages: BaseMessage[] = [...pastMessages, new HumanMessage(message)];
        
        const response = await this.model.invoke(messages);
        
        await history.addMessage(new HumanMessage(message));
        await history.addMessage(new AIMessage(response.content as string));
        
        await this.trimHistory(userId);
        
        return response.content as string;
      } catch (error: any) {
        lastError = error;
        console.error(`LLM chat error (attempt ${attempt + 1}/${this.llmConfig.maxRetries! + 1}):`, error.message);
        
        if (attempt < this.llmConfig.maxRetries!) {
          await this.sleep(this.llmConfig.retryDelay! * (attempt + 1));
        }
      }
    }
    
    console.error('LLM chat failed after all retries:', lastError);
    return this.getFallbackResponse();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getOrCreateHistory(userId: string): InMemoryChatMessageHistory {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new InMemoryChatMessageHistory());
    }
    return this.sessions.get(userId)!;
  }

  private async trimHistory(userId: string): Promise<void> {
    const history = this.sessions.get(userId);
    if (!history) return;
    
    const messages = await history.getMessages();
    const maxLength = this.llmConfig.maxHistoryLength! * 2;
    
    if (messages.length > maxLength) {
      const newHistory = new InMemoryChatMessageHistory();
      const messagesToKeep = messages.slice(-maxLength);
      for (const msg of messagesToKeep) {
        await newHistory.addMessage(msg);
      }
      this.sessions.set(userId, newHistory);
    }
  }

  clearSession(userId: string): void {
    this.sessions.delete(userId);
  }

  async getSessionHistory(userId: string): Promise<ChatMessage[]> {
    const history = this.sessions.get(userId);
    if (!history) return [];
    
    const messages = await history.getMessages();
    const result: ChatMessage[] = [];
    
    for (const msg of messages) {
      const content = typeof msg.content === 'string' 
        ? msg.content 
        : JSON.stringify(msg.content);
      const role = msg._getType() === 'human' ? 'user' : 'assistant';
      result.push({ role, content });
    }
    
    return result;
  }

  private getFallbackResponse(): string {
    if (this.llmConfig.fallbackResponse) {
      return this.llmConfig.fallbackResponse;
    }
    const fallbacks = [
      '抱歉，我暂时无法回答，请稍后再试。',
      '系统繁忙，请稍后再试。',
      '我遇到了一些问题，请稍后再问我。',
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getConfig(): LLMConfig {
    return { ...this.llmConfig };
  }

  async recognizeIntent(userInput: string): Promise<IntentResult> {
    const prompt = this.buildIntentPrompt(userInput);
    
    try {
      const response = await this.model.invoke([
        new HumanMessage(prompt),
      ]);
      
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'unknown',
          confidence: parsed.confidence || 0,
          entities: parsed.entities,
        };
      }
      
      return { intent: 'chat', confidence: 0.5 };
    } catch (error) {
      console.error('Intent recognition error:', error);
      return { intent: 'chat', confidence: 0.5 };
    }
  }

  private buildIntentPrompt(userInput: string): string {
    return `你是一个任务管理助手。分析用户的输入，识别用户意图并提取相关信息。

用户输入："${userInput}"

请以JSON格式返回分析结果：
{
  "intent": "create_task|list_tasks|delete_task|chat",
  "confidence": 0.0-1.0,
  "entities": {
    "schedule": "cron表达式",
    "scheduleDescription": "人类可读的时间描述",
    "taskName": "任务名称"
  }
}

时间转换规则：
- "每天X点" -> "0 X * * *"
- "每小时" -> "0 * * * *"
- "每X分钟" -> "*/X * * * *"
- "每周X" -> "0 0 * * X" (1=周一, 7=周日)
- "工作日X点" -> "0 X * * 1-5"
- "早上" 通常指 6-12 点
- "下午" 通常指 12-18 点
- "晚上" 通常指 18-23 点

意图判断规则：
- 如果用户想创建提醒或定时任务 -> create_task
- 如果用户想查看任务列表 -> list_tasks
- 如果用户想删除任务 -> delete_task
- 其他情况 -> chat

只返回JSON，不要有其他内容。`;
  }
}

export const llmService = new LLMService();
