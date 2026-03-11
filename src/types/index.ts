import * as line from '@line/bot-sdk';

export interface AppConfig {
  port: number;
  line: {
    channelSecret: string;
    channelAccessToken: string;
  };
  openai: {
    apiKey: string;
  };
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
