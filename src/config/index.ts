import dotenv from 'dotenv';
import { AppConfig, LLMConfig, TaskLimitConfig } from '../types';

dotenv.config();

const DEFAULT_LLM_CONFIG: Partial<LLMConfig> = {
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 1000,
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  fallbackResponse: '抱歉，我暂时无法回答，请稍后再试。',
  maxHistoryLength: 6,
};

const DEFAULT_TASK_LIMITS: TaskLimitConfig = {
  maxTasksPerUser: 10,
  minScheduleInterval: 1,
  defaultMaxExecuteCount: undefined,
};

function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER as LLMConfig['provider']) || 'openai';
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  
  return {
    provider,
    model: process.env.LLM_MODEL || DEFAULT_LLM_CONFIG.model!,
    apiKey,
    apiBaseUrl: process.env.LLM_API_BASE_URL || process.env.OPENAI_API_BASE,
    temperature: parseFloat(process.env.LLM_TEMPERATURE || String(DEFAULT_LLM_CONFIG.temperature)),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || String(DEFAULT_LLM_CONFIG.maxTokens), 10),
    timeout: parseInt(process.env.LLM_TIMEOUT || String(DEFAULT_LLM_CONFIG.timeout), 10),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || String(DEFAULT_LLM_CONFIG.maxRetries), 10),
    retryDelay: parseInt(process.env.LLM_RETRY_DELAY || String(DEFAULT_LLM_CONFIG.retryDelay), 10),
    fallbackResponse: process.env.LLM_FALLBACK_RESPONSE || DEFAULT_LLM_CONFIG.fallbackResponse,
    maxHistoryLength: parseInt(process.env.LLM_MAX_HISTORY_LENGTH || String(DEFAULT_LLM_CONFIG.maxHistoryLength), 10),
  };
}

function getTaskLimitConfig(): TaskLimitConfig {
  return {
    maxTasksPerUser: parseInt(process.env.MAX_TASKS_PER_USER || String(DEFAULT_TASK_LIMITS.maxTasksPerUser), 10),
    minScheduleInterval: parseInt(process.env.MIN_SCHEDULE_INTERVAL || String(DEFAULT_TASK_LIMITS.minScheduleInterval), 10),
    defaultMaxExecuteCount: process.env.DEFAULT_MAX_EXECUTE_COUNT
      ? parseInt(process.env.DEFAULT_MAX_EXECUTE_COUNT, 10)
      : DEFAULT_TASK_LIMITS.defaultMaxExecuteCount,
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
  llm: getLLMConfig(),
  taskLimits: getTaskLimitConfig(),
};

export function validateConfig(): void {
  const errors: string[] = [];
  
  if (!process.env.LINE_CHANNEL_SECRET) {
    errors.push('LINE_CHANNEL_SECRET is required');
  }
  
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    errors.push('LINE_CHANNEL_ACCESS_TOKEN is required');
  }
  
  if (!config.llm.apiKey) {
    errors.push('LLM_API_KEY or OPENAI_API_KEY is required');
  }
  
  if (config.llm.temperature !== undefined) {
    if (config.llm.temperature < 0 || config.llm.temperature > 2) {
      errors.push('LLM_TEMPERATURE must be between 0 and 2');
    }
  }
  
  if (config.llm.maxTokens !== undefined && config.llm.maxTokens < 1) {
    errors.push('LLM_MAX_TOKENS must be at least 1');
  }
  
  if (config.llm.timeout !== undefined && config.llm.timeout < 1000) {
    errors.push('LLM_TIMEOUT must be at least 1000ms');
  }
  
  if (config.llm.maxRetries !== undefined && config.llm.maxRetries < 0) {
    errors.push('LLM_MAX_RETRIES cannot be negative');
  }
  
  if (config.llm.maxHistoryLength !== undefined && config.llm.maxHistoryLength < 1) {
    errors.push('LLM_MAX_HISTORY_LENGTH must be at least 1');
  }
  
  const validProviders = ['openai', 'anthropic', 'azure', 'custom'];
  if (!validProviders.includes(config.llm.provider)) {
    errors.push(`LLM_PROVIDER must be one of: ${validProviders.join(', ')}`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

export function printConfig(): void {
  console.log('Configuration loaded:');
  console.log(`  Port: ${config.port}`);
  console.log(`  LLM Provider: ${config.llm.provider}`);
  console.log(`  LLM Model: ${config.llm.model}`);
  console.log(`  LLM Temperature: ${config.llm.temperature}`);
  console.log(`  LLM Max Tokens: ${config.llm.maxTokens}`);
  console.log(`  LLM Timeout: ${config.llm.timeout}ms`);
  console.log(`  LLM Max Retries: ${config.llm.maxRetries}`);
  console.log(`  LLM Max History Length: ${config.llm.maxHistoryLength}`);
  if (config.llm.apiBaseUrl) {
    console.log(`  LLM API Base URL: ${config.llm.apiBaseUrl}`);
  }
}
