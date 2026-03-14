# LINE Messaging API 消息推送功能技术规范分析

## 文档信息

| 项目名称 | LINE Bot 智能消息处理系统 |
|---------|-------------------------|
| 文档版本 | V1.0 |
| 创建日期 | 2026-03-14 |
| 文档状态 | 已完成 |
| 参考来源 | LINE Developers 官方文档 |

---

## 1. 概述

### 1.1 文档目的

本文档详细分析 LINE Messaging API 中消息推送功能的技术规范，明确实现消息推送所需的必要数据字段、格式要求及验证规则，为系统设计提供技术依据。

### 1.2 消息推送类型

LINE Messaging API 提供以下消息推送方式：

| API 类型 | 用途 | 特点 |
|---------|------|------|
| **Reply Message** | 回复用户消息 | 需要 replyToken，有效期 30 秒 |
| **Push Message** | 主动推送消息 | 无需用户先发消息，需要 userId |
| **Multicast Message** | 批量推送消息 | 向多个用户推送相同消息 |
| **Broadcast Message** | 广播消息 | 向所有好友推送消息 |
| **Narrowcast Message** | 精准推送 | 基于条件筛选用户推送 |

---

## 2. 用户身份标识

### 2.1 User ID 格式规范

| 属性 | 规范 |
|------|------|
| **格式** | 以 `U` 开头的字符串 |
| **长度** | 33 字符 |
| **示例** | `U1234567890abcdef1234567890abcde` |
| **来源** | Webhook 事件、Get Profile API |

### 2.2 User ID 获取方式

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        User ID 获取方式                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  方式一：Webhook 事件                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  {                                                              │   │
│  │    "events": [{                                                 │   │
│  │      "source": {                                                │   │
│  │        "type": "user",                                          │   │
│  │        "userId": "U1234567890abcdef..."  ◀── 用户ID             │   │
│  │      }                                                          │   │
│  │    }]                                                           │   │
│  │  }                                                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  方式二：Get Profile API                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  GET /v2/bot/profile/{userId}                                   │   │
│  │  Response: { "userId": "U1234567890abcdef..." }                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  方式三：Get Follower IDs API                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  GET /v2/bot/followers/ids                                      │   │
│  │  Response: { "userIds": ["U123...", "U456..."] }                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 其他目标类型

| 目标类型 | ID 前缀 | 说明 |
|---------|--------|------|
| 用户 | `U` | 个人用户 |
| 群组 | `C` | 群聊 |
| 多人聊天 | `R` | 多人聊天室 |

### 2.4 User ID 验证规则

```typescript
export function validateUserId(userId: string): boolean {
  if (!userId || typeof userId !== 'string') {
    return false;
  }
  
  if (userId.length !== 33) {
    return false;
  }
  
  if (!userId.startsWith('U')) {
    return false;
  }
  
  const pattern = /^U[a-f0-9]{32}$/i;
  return pattern.test(userId);
}
```

---

## 3. 消息内容结构

### 3.1 消息类型概览

| 消息类型 | type 值 | 用途 |
|---------|---------|------|
| 文本消息 | `text` | 发送文本内容 |
| 图片消息 | `image` | 发送图片 |
| 视频消息 | `video` | 发送视频 |
| 音频消息 | `audio` | 发送音频 |
| 位置消息 | `location` | 发送位置信息 |
| 贴图消息 | `sticker` | 发送 LINE 贴图 |
| Flex 消息 | `flex` | 富媒体消息 |
| 模板消息 | `template` | 交互式模板 |

### 3.2 文本消息结构

```typescript
interface TextMessage {
  type: 'text';
  text: string;
  quoteToken?: string;
  emojis?: Array<{
    index: number;
    productId: string;
    emojiId: string;
  }>;
}
```

**字段规范：**

| 字段 | 类型 | 必填 | 限制 | 说明 |
|------|------|------|------|------|
| type | string | 是 | 固定值 "text" | 消息类型 |
| text | string | 是 | 最大 5000 字符 | 消息内容 |
| quoteToken | string | 否 | - | 引用消息 Token |
| emojis | array | 否 | 最大 20 个 | LINE 表情 |

**文本消息示例：**

```json
{
  "type": "text",
  "text": "⏰ 时间提醒\n当前时间：2026-03-14 09:00:00\n星期五"
}
```

### 3.3 消息数组限制

| 限制项 | 限制值 | 说明 |
|--------|--------|------|
| 单次消息数量 | 最大 5 条 | 每次推送最多 5 条消息 |
| 文本消息长度 | 最大 5000 字符 | 单条文本消息 |
| 消息总大小 | 约 100KB | 所有消息合计 |

### 3.4 消息对象验证

```typescript
export function validateMessage(message: any): { valid: boolean; error?: string } {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }
  
  if (!message.type) {
    return { valid: false, error: 'Message type is required' };
  }
  
  switch (message.type) {
    case 'text':
      if (!message.text || typeof message.text !== 'string') {
        return { valid: false, error: 'Text message requires text field' };
      }
      if (message.text.length > 5000) {
        return { valid: false, error: 'Text exceeds 5000 characters' };
      }
      break;
      
    default:
      return { valid: false, error: `Unsupported message type: ${message.type}` };
  }
  
  return { valid: true };
}
```

---

## 4. API 请求参数

### 4.1 Push Message API

**端点：** `POST https://api.line.me/v2/bot/message/push`

**请求头：**

| Header | 值 | 必填 | 说明 |
|--------|-----|------|------|
| Content-Type | application/json | 是 | 内容类型 |
| Authorization | Bearer `{ACCESS_TOKEN}` | 是 | 认证令牌 |

**请求体：**

```typescript
interface PushMessageRequest {
  to: string;           // 用户ID
  messages: Message[];  // 消息数组 (1-5条)
  notificationDisabled?: boolean;  // 是否禁用通知
}
```

**请求示例：**

```json
{
  "to": "U1234567890abcdef1234567890abcde",
  "messages": [
    {
      "type": "text",
      "text": "⏰ 时间提醒\n当前时间：2026-03-14 09:00:00\n星期五"
    }
  ]
}
```

**响应：**

```json
{
  "sentMessages": [
    {
      "id": "325708",
      "quoteToken": "q3y2L..."
    }
  ]
}
```

### 4.2 Multicast Message API

**端点：** `POST https://api.line.me/v2/bot/message/multicast`

**请求体：**

```typescript
interface MulticastMessageRequest {
  to: string[];         // 用户ID数组
  messages: Message[];  // 消息数组 (1-5条)
  notificationDisabled?: boolean;
  multicastId?: string; // 用于追踪的ID
}
```

**限制：**

| 限制项 | 限制值 |
|--------|--------|
| 目标用户数量 | 最大 500 人 |
| 消息数量 | 1-5 条 |

**请求示例：**

```json
{
  "to": [
    "U1234567890abcdef1234567890abcde",
    "U9876543210fedcba9876543210fedcba"
  ],
  "messages": [
    {
      "type": "text",
      "text": "群发消息内容"
    }
  ]
}
```

### 4.3 SDK 调用方式

```typescript
import { messagingApi } from '@line/bot-sdk';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

// Push Message
await client.pushMessage({
  to: 'U1234567890abcdef...',
  messages: [{ type: 'text', text: 'Hello!' }],
});

// Multicast Message
await client.multicast({
  to: ['U123...', 'U456...'],
  messages: [{ type: 'text', text: 'Hello!' }],
});
```

---

## 5. 认证机制

### 5.1 Channel Access Token

| 属性 | 说明 |
|------|------|
| **类型** | 长期有效 Token / 短期 Token |
| **格式** | JWT 格式字符串 |
| **长度** | 约 200-300 字符 |
| **存储** | 环境变量，不提交代码库 |

**Token 格式示例：**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2FjY2Vzcy5saW5lLm1lIiwic3ViIjoi...
```

### 5.2 认证方式

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        API 认证流程                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  客户端                          LINE API 服务器                         │
│    │                                   │                                │
│    │  1. 构建请求                      │                                │
│    │     Header: Authorization: Bearer {TOKEN}                         │
│    │ ─────────────────────────────────▶│                                │
│    │                                   │                                │
│    │                                   │  2. 验证 Token                 │
│    │                                   │     - 检查有效性               │
│    │                                   │     - 检查权限                 │
│    │                                   │                                │
│    │  3. 返回响应                      │                                │
│    │ ◀─────────────────────────────────│                                │
│    │                                   │                                │
│    │     成功: 200 OK + 数据           │                                │
│    │     失败: 401 Unauthorized       │                                │
│    │                                   │                                │
│    └───────────────────────────────────┘                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Channel Secret

| 属性 | 说明 |
|------|------|
| **用途** | Webhook 签名验证 |
| **格式** | 32 字符十六进制字符串 |
| **存储** | 环境变量 |

**签名验证流程：**

```typescript
import * as crypto from 'crypto';

export function validateSignature(
  body: string,
  signature: string,
  channelSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');
  
  return signature === expectedSignature;
}
```

### 5.4 Token 管理

```typescript
export class TokenManager {
  private token: string;
  private expiresAt?: Date;
  
  constructor(private readonly config: {
    longLivedToken: string;
  }) {
    this.token = config.longLivedToken;
  }
  
  getToken(): string {
    return this.token;
  }
  
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() >= this.expiresAt;
  }
}
```

---

## 6. 速率限制

### 6.1 API 调用限制

| API 类型 | 限制 | 时间窗口 |
|---------|------|---------|
| Push Message | 200,000 次 | 每月 |
| Multicast Message | 200,000 次 | 每月 |
| Reply Message | 无限制 | - |
| Broadcast Message | 100 次 | 每月 |

### 6.2 消息推送限制

| 限制类型 | 限制值 | 说明 |
|---------|--------|------|
| 目标用户数 (Multicast) | 500 人/次 | 单次批量推送 |
| 消息数量 | 5 条/次 | 单次推送消息数 |
| 文本长度 | 5000 字符 | 单条文本消息 |

### 6.3 限流处理策略

```typescript
export class RateLimiter {
  private requestCount: number = 0;
  private resetTime: Date;
  
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {
    this.resetTime = new Date(Date.now() + windowMs);
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isLimitReached()) {
      await this.waitForReset();
    }
    
    this.requestCount++;
    return fn();
  }
  
  private isLimitReached(): boolean {
    if (new Date() >= this.resetTime) {
      this.reset();
    }
    return this.requestCount >= this.maxRequests;
  }
  
  private async waitForReset(): Promise<void> {
    const waitTime = this.resetTime.getTime() - Date.now();
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.reset();
  }
  
  private reset(): void {
    this.requestCount = 0;
    this.resetTime = new Date(Date.now() + this.windowMs);
  }
}
```

---

## 7. 错误处理

### 7.1 错误码定义

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | InvalidRequest | 请求格式错误 |
| 401 | InvalidAccessToken | Token 无效或过期 |
| 403 | NotAllowed | 权限不足 |
| 404 | NotFound | 资源不存在 |
| 429 | TooManyRequests | 请求过于频繁 |
| 500 | InternalServerError | 服务器内部错误 |

### 7.2 错误响应格式

```json
{
  "message": "Invalid access token",
  "details": [
    {
      "message": "Invalid access token",
      "property": "Authorization"
    }
  ]
}
```

### 7.3 常见错误处理

```typescript
export async function handleLineApiError(error: any): Promise<string> {
  if (!error.response) {
    return '网络错误，请检查网络连接';
  }
  
  const { status, data } = error.response;
  
  switch (status) {
    case 400:
      return `请求格式错误: ${data.message}`;
    case 401:
      return '认证失败，请检查 Access Token';
    case 403:
      return '权限不足，请检查 Channel 权限';
    case 404:
      return '用户不存在或未添加好友';
    case 429:
      return '请求过于频繁，请稍后再试';
    case 500:
      return 'LINE 服务器错误，请稍后再试';
    default:
      return `未知错误: ${status}`;
  }
}
```

---

## 8. 系统设计影响分析

### 8.1 数据存储需求

| 数据类型 | 存储需求 | 说明 |
|---------|---------|------|
| User ID | 必须存储 | 用于推送目标 |
| 任务配置 | 必须存储 | Cron 表达式、任务参数 |
| 推送记录 | 建议存储 | 用于追踪和统计 |
| 错误日志 | 建议存储 | 用于问题排查 |

### 8.2 架构设计考量

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    消息推送系统架构                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         应用层                                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │ Chat API    │  │  Webhook    │  │ Task Manager│               │  │
│  │  │ /api/chat   │  │  /webhook   │  │  (定时任务)  │               │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │  │
│  └─────────┼────────────────┼────────────────┼───────────────────────┘  │
│            │                │                │                          │
│            └────────────────┼────────────────┘                          │
│                             │                                           │
│                             ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         服务层                                     │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    LineService                               │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │  │  │
│  │  │  │ pushMessage│  │ multicast │  │replyMessage│               │  │  │
│  │  │  └───────────┘  └───────────┘  └───────────┘                │  │  │
│  │  │                                                              │  │  │
│  │  │  功能:                                                       │  │  │
│  │  │  - 消息格式验证                                              │  │  │
│  │  │  - User ID 验证                                              │  │  │
│  │  │  - 速率限制检查                                              │  │  │
│  │  │  - 错误处理                                                  │  │  │
│  │  │  - 重试机制                                                  │  │  │
│  │  │                                                              │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                           │
│                             ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         数据层                                     │  │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐      │  │
│  │  │ User ID   │  │ Task      │  │ Message   │  │ Error     │      │  │
│  │  │ Storage   │  │ Config    │  │ Log       │  │ Log       │      │  │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 关键技术考量

| 考量因素 | 说明 | 建议 |
|---------|------|------|
| **User ID 管理** | 需要正确获取和存储用户ID | 从 Webhook 事件中提取并持久化 |
| **消息格式** | 严格遵守 LINE 消息格式规范 | 使用 SDK 类型定义 |
| **速率限制** | 避免触发 API 限制 | 实现请求队列和限流器 |
| **错误处理** | 处理各种 API 错误 | 实现重试机制和降级策略 |
| **Token 安全** | 保护 Access Token | 环境变量存储，不提交代码库 |

### 8.4 安全考量

| 安全措施 | 实现方式 |
|---------|---------|
| Token 保护 | 环境变量存储，日志脱敏 |
| 签名验证 | Webhook 使用 Channel Secret 验证 |
| HTTPS | 所有 API 调用使用 HTTPS |
| 输入验证 | 验证 User ID 和消息格式 |
| 速率限制 | 防止 API 滥用 |

---

## 9. 最佳实践

### 9.1 消息推送建议

```typescript
export class MessagePusher {
  private readonly MAX_RETRY = 3;
  private readonly RETRY_DELAY = 1000;
  
  async pushWithRetry(
    userId: string,
    message: Message
  ): Promise<void> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.MAX_RETRY; i++) {
      try {
        await this.client.pushMessage({
          to: userId,
          messages: [message],
        });
        return;
      } catch (error: any) {
        lastError = error;
        
        if (this.isRetryable(error)) {
          await this.delay(this.RETRY_DELAY * (i + 1));
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }
  
  private isRetryable(error: any): boolean {
    const retryableStatuses = [429, 500, 502, 503];
    return retryableStatuses.includes(error.response?.status);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 9.2 批量推送优化

```typescript
export async function multicastInBatches(
  userIds: string[],
  message: Message,
  batchSize: number = 500
): Promise<void> {
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    
    await this.client.multicast({
      to: batch,
      messages: [message],
    });
    
    if (i + batchSize < userIds.length) {
      await this.delay(100);
    }
  }
}
```

### 9.3 消息模板

```typescript
export class TimeMessageBuilder {
  build(): Message {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const weekday = weekdays[now.getDay()];
    
    const text = [
      '⏰ 时间提醒',
      `当前时间：${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
      `星期${weekday}`
    ].join('\n');
    
    return {
      type: 'text',
      text,
    };
  }
}
```

---

## 10. 总结

### 10.1 关键数据字段

| 字段 | 类型 | 必要性 | 来源 |
|------|------|--------|------|
| userId | string (33字符) | 必须 | Webhook / Get Profile |
| channelAccessToken | string | 必须 | LINE Developers Console |
| channelSecret | string (32字符) | 必须 | LINE Developers Console |
| message.type | string | 必须 | 固定值 |
| message.text | string (≤5000) | 必须 | 应用生成 |

### 10.2 实现检查清单

- [ ] User ID 格式验证
- [ ] 消息格式验证
- [ ] Token 安全存储
- [ ] 速率限制实现
- [ ] 错误处理机制
- [ ] 重试机制实现
- [ ] 日志记录（脱敏）
- [ ] Webhook 签名验证

### 10.3 参考文档

- [LINE Messaging API Reference](https://developers.line.biz/en/reference/messaging-api/)
- [@line/bot-sdk GitHub](https://github.com/line/line-bot-sdk-nodejs)
- [LINE Developers Console](https://developers.line.biz/console/)

---

## 修订历史

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| V1.0 | 2026-03-14 | 初始版本 |
