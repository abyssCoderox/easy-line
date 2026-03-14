import * as line from '@line/bot-sdk';

export interface AppConfig {
  port: number;
  line: {
    channelSecret: string;
    channelAccessToken: string;
  };
  llm: LLMConfig;
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'azure' | 'custom';
  model: string;
  apiKey: string;
  apiBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  fallbackResponse?: string;
  maxHistoryLength?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  userId: string;
  message: string;
}

export interface ChatResponseData {
  userId: string;
  reply: string;
  timestamp: string;
}

export interface ChatResponse {
  code: 0;
  message: 'success';
  data: ChatResponseData;
}

export interface TaskConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  api: {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };
  template: string;
  targets: string[];
}

export interface TaskConfigFile {
  tasks: TaskConfig[];
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface TaskExecutionLog {
  taskId: string;
  executeTime: Date;
  status: 'success' | 'failed';
  duration?: number;
  error?: string;
}

export type TextMessage = line.TextMessage;
export type ImageMessage = line.ImageMessage;
export type FlexMessage = line.FlexMessage;
export type Message = line.Message;
export type WebhookEvent = line.WebhookEvent;
