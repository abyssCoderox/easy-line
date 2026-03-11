import { ChatOpenAI } from '@langchain/openai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import { config } from '../config';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class LLMService {
  private model: ChatOpenAI;
  private sessions: Map<string, BufferMemory> = new Map();
  private readonly maxHistoryLength: number = 6;
  
  constructor() {
    this.model = new ChatOpenAI({
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      openAIApiKey: config.openai.apiKey,
      maxTokens: 1000,
    });
  }

  async chat(userId: string, message: string): Promise<string> {
    try {
      const memory = this.getOrCreateMemory(userId);
      
      const chain = new ConversationChain({
        llm: this.model,
        memory: memory,
      });
      
      const response = await chain.call({ input: message });
      return response.response;
    } catch (error) {
      console.error('LLM chat error:', error);
      return this.getFallbackResponse();
    }
  }

  private getOrCreateMemory(userId: string): BufferMemory {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new BufferMemory({
        returnMessages: true,
        memoryKey: 'history',
        inputKey: 'input',
        outputKey: 'output',
      }));
    }
    return this.sessions.get(userId)!;
  }

  clearSession(userId: string): void {
    this.sessions.delete(userId);
  }

  async getSessionHistory(userId: string): Promise<ChatMessage[]> {
    const memory = this.sessions.get(userId);
    if (!memory) return [];
    
    const history = memory.chatHistory;
    const messages: ChatMessage[] = [];
    
    if (history && typeof history.getMessages === 'function') {
      const msgs = await history.getMessages();
      for (const msg of msgs) {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        messages.push({
          role: msg._getType() === 'human' ? 'user' : 'assistant',
          content,
        });
      }
    }
    
    return messages;
  }

  private getFallbackResponse(): string {
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
}

export const llmService = new LLMService();
