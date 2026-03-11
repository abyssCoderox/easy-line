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

实现大模型服务模块，集成 LangChain.js 框架，提供智能对话能力和上下文管理功能。

## 2. 任务范围

### 2.1 包含内容

- [ ] LLMService 类实现
- [ ] LangChain 集成
- [ ] 对话生成功能
- [ ] 上下文管理（BufferMemory）
- [ ] 降级回复机制
- [ ] 会话管理

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
import { ConversationChain } from 'langchain/chains';
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
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
  
  getSessionHistory(userId: string): ChatMessage[] {
    const memory = this.sessions.get(userId);
    if (!memory) return [];
    
    const history = memory.chatHistory;
    return history.messages.map((msg: any) => ({
      role: msg._getType() === 'human' ? 'user' : 'assistant',
      content: msg.content,
    }));
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
```

### 3.2 类型定义更新

**更新 src/types/index.ts:**

```typescript
export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000', 10),
  },
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

**返回值：** ChatMessage[]

---

## 5. 验收标准

### 5.1 功能验收

- [ ] LLMService 类正确初始化
- [ ] chat() 返回有效回复
- [ ] 上下文记忆生效（连续对话）
- [ ] 会话隔离正确
- [ ] 降级回复正常工作
- [ ] API 错误时返回降级回复

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
| 网络超时 | 返回降级回复 |
| Token 超限 | 返回降级回复 |
| 模型不可用 | 返回降级回复 |

### 7.2 错误日志

```typescript
try {
  const response = await chain.call({ input: message });
  return response.response;
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

## 8. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenAI API 限流 | 响应延迟 | 添加重试机制 |
| Token 消耗过大 | 成本增加 | 设置 maxTokens |
| 内存泄漏 | 服务崩溃 | 定期清理会话 |
| 上下文过长 | 响应变慢 | 限制历史长度 |

---

## 9. 输出物

- [ ] src/services/llm.service.ts
- [ ] 更新 src/types/index.ts
- [ ] 更新 src/config/index.ts
- [ ] 单元测试文件
