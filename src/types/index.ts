import * as line from '@line/bot-sdk';

export interface AppConfig {
  port: number;
  line: {
    channelSecret: string;
    channelAccessToken: string;
  };
  llm: LLMConfig;
  taskLimits?: TaskLimitConfig;
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

export interface UserTaskConfig {
  taskId: string;
  userId: string;
  taskName: string;
  schedule: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  messageTemplate: string;
  lastExecuteTime?: Date;
  nextExecuteTime?: Date;
  executeCount: number;
  maxExecuteCount?: number;
}

export interface TaskCreateRequest {
  userId: string;
  input: string;
  inputType?: 'command' | 'natural';
}

export interface TaskCreateResponse {
  success: boolean;
  taskId?: string;
  taskName?: string;
  schedule?: string;
  scheduleDescription?: string;
  nextExecuteTime?: Date;
  message?: string;
}

export interface IntentResult {
  intent: 'create_task' | 'list_tasks' | 'delete_task' | 'update_task' | 'unknown' | 'chat';
  confidence: number;
  entities?: {
    schedule?: string;
    scheduleDescription?: string;
    taskId?: string;
    taskName?: string;
  };
}

export interface CommandParseResult {
  command: 'create' | 'list' | 'delete' | 'enable' | 'disable' | 'help' | null;
  params: {
    schedule?: string;
    taskName?: string;
    taskId?: string;
    enabled?: boolean;
  };
  error?: string;
}

export interface TaskLimitConfig {
  maxTasksPerUser: number;
  minScheduleInterval: number;
  defaultMaxExecuteCount?: number;
}

export type TextMessage = line.TextMessage;
export type ImageMessage = line.ImageMessage;
export type FlexMessage = line.FlexMessage;
export type Message = line.Message;
export type WebhookEvent = line.WebhookEvent;
