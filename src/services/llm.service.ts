import { ChatOpenAI } from '@langchain/openai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { config } from '../config';
import { LLMConfig, ChatMessage } from '../types';

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
}

export const llmService = new LLMService();
