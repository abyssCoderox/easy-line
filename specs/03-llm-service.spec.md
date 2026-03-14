# Spec: LLM服务模块

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-003 |
| 任务名称 | LLM服务模块开发 |
| 优先级 | P0 (最高) |
| 预计工时 | 3小时 |
| 依赖任务 | SPEC-001 (项目初始化) |
| 负责模块 | src/services/llm.service.ts |

---

## 1. 任务目标

实现大模型服务模块，集成 LangChain.js 1.x 框架，提供智能对话能力和上下文管理功能。

## 2. 任务范围

### 2.1 包含内容

- [ ] LLMService 类实现
- [ ] LangChain 1.x 集成
- [ ] 对话生成功能
- [ ] 上下文管理（ChatMessageHistory）
- [ ] 降级回复机制
- [ ] 会话管理
- [ ] 配置化管理

### 2.2 不包含内容

- 意图识别
- 多模型切换
- 高级Prompt工程

---

## 3. 详细任务清单

### 3.1 LLMService 类实现

**文件路径：** `src/services/llm.service.ts`

```typescript
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
  
  private getOrCreateHistory(userId: string): ChatMessageHistory {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new ChatMessageHistory());
    }
    return this.sessions.get(userId)!;
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
```

### 3.2 类型定义更新

**更新 src/types/index.ts:**

```typescript
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

export interface ChatSession {
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}
```

### 3.3 配置更新

**更新 src/config/index.ts:**

```typescript
import dotenv from 'dotenv';
import { AppConfig, LLMConfig } from '../types';

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

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
  llm: getLLMConfig(),
};
```

---

## 4. API接口说明

### 4.1 chat()

与用户进行对话。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |
| message | string | 用户消息 |

**返回值：** Promise<string> - AI回复内容

**使用示例：**
```typescript
const reply = await llmService.chat('U1234567890', '你好');
console.log(reply);
```

### 4.2 clearSession()

清除用户会话历史。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |

**返回值：** void

### 4.3 getSessionHistory()

获取用户会话历史。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |

**返回值：** Promise<ChatMessage[]>

### 4.4 addSystemMessage()

向用户会话中添加系统消息，用于将定时任务推送的消息纳入上下文管理。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| userId | string | 用户ID |
| message | string | 系统消息内容 |

**返回值：** Promise<void>

**使用场景：**
- 定时任务推送消息后，将消息纳入用户上下文
- 系统通知需要被 AI 感知的场景

**使用示例：**
```typescript
// 定时任务推送后，将消息纳入上下文
const timeMessage = '⏰ 时间提醒\n当前时间：2026-03-15 10:00:00\n星期五';
await lineService.pushMessage(userId, [{ type: 'text', text: timeMessage }]);
await llmService.addSystemMessage(userId, timeMessage);

// 用户后续可以询问
// 用户: "刚才提醒我什么了？"
// AI: "刚才提醒您当前时间是 2026-03-15 10:00:00，星期五。"
```

**注意事项：**
- 系统消息以 AIMessage 形式存储，带有 `[系统消息]` 前缀
- 会触发历史消息裁剪，确保不会超出 maxHistoryLength 限制
- 如果用户会话不存在，会自动创建

---

## 5. 验收标准

### 5.1 功能验收

- [ ] LLMService 类正确初始化
- [ ] chat() 返回有效回复
- [ ] 上下文记忆生效（连续对话）
- [ ] 会话隔离正确
- [ ] 降级回复正常工作
- [ ] API 错误时返回降级回复
- [ ] 配置参数正确读取

### 5.2 性能验收

- [ ] 单次对话响应时间 < 5秒
- [ ] 内存使用合理（无泄漏）

---

## 6. 测试验证

### 6.1 单元测试

```typescript
describe('LLMService', () => {
  it('should return response for valid message', async () => {
    const reply = await llmService.chat('test-user', '你好');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });
  
  it('should maintain conversation context', async () => {
    await llmService.chat('test-user', '我叫小明');
    const reply = await llmService.chat('test-user', '我叫什么名字？');
    expect(reply).toContain('小明');
  });
  
  it('should clear session correctly', () => {
    llmService.clearSession('test-user');
    const history = llmService.getSessionHistory('test-user');
    expect(history.length).toBe(0);
  });
});
```

### 6.2 集成测试

```typescript
describe('LLM Integration', () => {
  it('should handle multiple users', async () => {
    const [reply1, reply2] = await Promise.all([
      llmService.chat('user1', '你好'),
      llmService.chat('user2', '你好'),
    ]);
    
    expect(reply1).toBeDefined();
    expect(reply2).toBeDefined();
    expect(llmService.getActiveSessionCount()).toBe(2);
  });
});
```

---

## 7. 错误处理

### 7.1 错误场景

| 错误类型 | 处理方式 |
|---------|---------|
| API Key 无效 | 启动时验证，抛出错误 |
| 网络超时 | 重试机制，返回降级回复 |
| Token 超限 | 返回降级回复 |
| 模型不可用 | 返回降级回复 |

### 7.2 错误日志

```typescript
try {
  const response = await this.model.invoke(messages);
  return response.content as string;
} catch (error: any) {
  console.error('LLM chat error:', {
    userId,
    message,
    error: error.message,
    stack: error.stack,
  });
  return this.getFallbackResponse();
}
```

---

## 8. 配置参数说明

### 8.1 环境变量

| 变量名 | 说明 | 默认值 | 取值范围 |
|--------|------|--------|---------|
| LLM_PROVIDER | 模型提供商 | openai | openai, anthropic, azure, custom |
| LLM_API_KEY | API密钥 | - | 必填 |
| LLM_MODEL | 模型名称 | gpt-3.5-turbo | - |
| LLM_API_BASE_URL | API基础URL | - | 可选，用于自定义端点 |
| LLM_TEMPERATURE | 温度参数 | 0.7 | 0-2 |
| LLM_MAX_TOKENS | 最大Token数 | 1000 | >= 1 |
| LLM_TIMEOUT | 请求超时(ms) | 30000 | >= 1000 |
| LLM_MAX_RETRIES | 最大重试次数 | 3 | >= 0 |
| LLM_RETRY_DELAY | 重试延迟(ms) | 1000 | >= 0 |
| LLM_FALLBACK_RESPONSE | 降级回复 | - | - |
| LLM_MAX_HISTORY_LENGTH | 历史消息长度 | 6 | >= 1 |

### 8.2 向后兼容

- `OPENAI_API_KEY` 可替代 `LLM_API_KEY`
- `OPENAI_API_BASE` 可替代 `LLM_API_BASE_URL`

---

## 9. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenAI API 限流 | 响应延迟 | 添加重试机制 |
| Token 消耗过大 | 成本增加 | 设置 maxTokens |
| 内存泄漏 | 服务崩溃 | 定期清理会话 |
| 上下文过长 | 响应变慢 | 限制历史长度 |

---

## 10. 输出物

- [ ] src/services/llm.service.ts
- [ ] 更新 src/types/index.ts
- [ ] 更新 src/config/index.ts
- [ ] 单元测试文件
