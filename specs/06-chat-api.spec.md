# Spec: Chat API 端点

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-006 |
| 任务名称 | Chat API 端点开发 |
| 优先级 | P1 (高) |
| 预计工时 | 2小时 |
| 依赖任务 | SPEC-003 (LLM服务) |
| 负责模块 | src/routes/api.ts, src/types/index.ts |

---

## 1. 任务目标

实现一个 `/api/chat` HTTP API 端点，复制现有 Webhook 实现中使用的**确切**消息处理逻辑，为外部系统提供直接调用聊天功能的接口。

### 1.1 与 Webhook 的关系

本端点与现有 Webhook (`/webhook`) 共享相同的核心消息处理逻辑：

| 特性 | Webhook | Chat API |
|------|---------|----------|
| 触发方式 | LINE 平台推送 | HTTP 请求 |
| 签名验证 | LINE 签名验证 | API Key 验证 |
| 消息来源 | LINE 消息事件 | 请求体参数 |
| 响应方式 | LINE replyMessage | HTTP 响应 |
| LLM 处理 | ✅ 相同 | ✅ 相同 |
| 会话管理 | ✅ 相同 | ✅ 相同 |
| 错误处理 | ✅ 相同 | ✅ 相同 |

---

## 2. API 端点规范

### 2.1 基本信息

| 属性 | 值 |
|------|-----|
| HTTP 方法 | POST |
| URL 路径 | /api/chat |
| Content-Type | application/json |

### 2.2 请求格式

#### 请求头

| 头字段 | 必填 | 类型 | 说明 |
|--------|------|------|------|
| Content-Type | 是 | string | 必须为 `application/json` |
| X-API-Key | 是 | string | API 密钥，用于身份验证 |

#### 请求体

```typescript
interface ChatRequest {
  userId: string;       // 必填，用户唯一标识符
  message: string;      // 必填，用户消息内容
}
```

| 字段 | 必填 | 类型 | 约束 | 说明 |
|------|------|------|------|------|
| userId | 是 | string | 1-100 字符 | 用户唯一标识符，用于会话管理 |
| message | 是 | string | 1-5000 字符 | 用户发送的消息内容 |

### 2.3 响应格式

#### 成功响应 (200 OK)

```typescript
interface ChatResponse {
  code: 0;
  message: 'success';
  data: {
    userId: string;      // 用户ID
    reply: string;       // AI 回复内容
    timestamp: string;   // 响应时间戳 (ISO 8601)
  };
}
```

#### 错误响应

```typescript
interface ChatErrorResponse {
  code: number;          // 错误码
  message: string;       // 错误消息
}
```

### 2.4 状态码

| 状态码 | 说明 | 场景 |
|--------|------|------|
| 200 | 成功 | 请求处理成功 |
| 400 | 请求错误 | 参数验证失败 |
| 401 | 未授权 | API Key 缺失或无效 |
| 500 | 服务器错误 | 内部处理错误 |

---

## 3. 消息处理流程

### 3.1 处理流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat API 处理流程                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 接收 HTTP 请求                                          │
│       │                                                     │
│       ▼                                                     │
│  2. 验证 API Key                                            │
│       │                                                     │
│       ├── 失败 ──► 返回 401 Unauthorized                    │
│       │                                                     │
│       ▼                                                     │
│  3. 解析请求体                                              │
│       │                                                     │
│       ├── 失败 ──► 返回 400 Bad Request                     │
│       │                                                     │
│       ▼                                                     │
│  4. 验证请求参数                                            │
│       │                                                     │
│       ├── 失败 ──► 返回 400 Bad Request                     │
│       │                                                     │
│       ▼                                                     │
│  5. 调用 llmService.chat(userId, message)                   │
│       │                                                     │
│       │  ┌─────────────────────────────────────────┐        │
│       │  │ LLM Service 内部流程 (与 Webhook 相同)   │        │
│       │  │                                         │        │
│       │  │  a. 获取/创建用户会话历史               │        │
│       │  │  b. 构建消息上下文                      │        │
│       │  │  c. 调用 LLM 模型                       │        │
│       │  │  d. 保存对话历史                        │        │
│       │  │  e. 裁剪历史长度                        │        │
│       │  │  f. 返回 AI 回复                        │        │
│       │  │                                         │        │
│       │  │  错误处理:                              │        │
│       │  │  - 重试机制 (maxRetries 次)             │        │
│       │  │  - 返回降级回复                         │        │
│       │  └─────────────────────────────────────────┘        │
│       │                                                     │
│       ▼                                                     │
│  6. 构建响应                                                │
│       │                                                     │
│       ▼                                                     │
│  7. 返回 200 OK + 响应体                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 与 Webhook 的逻辑对比

#### Webhook 处理逻辑 (现有)

```typescript
// src/routes/webhook.ts
async function handleEvent(event: WebhookEvent): Promise<void> {
  // 步骤 1: 过滤非文本消息
  if (event.type !== 'message') return;
  if (event.message.type !== 'text') return;
  
  // 步骤 2: 提取参数
  const userId = event.source.userId!;
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  
  try {
    // 步骤 3: 调用 LLM 服务 (核心逻辑)
    const reply = await llmService.chat(userId, userMessage);
    
    // 步骤 4: 通过 LINE SDK 回复
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: reply,
    }]);
  } catch (error) {
    // 步骤 5: 错误处理 - 发送错误消息
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: '抱歉，处理您的消息时出现错误，请稍后再试。',
    }]);
  }
}
```

#### Chat API 处理逻辑 (新增)

```typescript
// src/routes/api.ts (新增端点)
router.post('/chat', authenticateApiKey, async (req, res) => {
  // 步骤 1: 参数验证 (替代 Webhook 的事件过滤)
  const { userId, message } = req.body;
  
  if (!userId || !message) {
    return res.status(400).json({
      code: 400,
      message: 'Missing required fields: userId and message are required',
    });
  }
  
  if (typeof userId !== 'string' || typeof message !== 'string') {
    return res.status(400).json({
      code: 400,
      message: 'Invalid field types: userId and message must be strings',
    });
  }
  
  if (userId.length < 1 || userId.length > 100) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid userId: must be between 1 and 100 characters',
    });
  }
  
  if (message.length < 1 || message.length > 5000) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid message: must be between 1 and 5000 characters',
    });
  }
  
  try {
    // 步骤 2: 调用 LLM 服务 (与 Webhook 完全相同)
    const reply = await llmService.chat(userId, message);
    
    // 步骤 3: 返回 HTTP 响应 (替代 LINE SDK 回复)
    res.json({
      code: 0,
      message: 'success',
      data: {
        userId,
        reply,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    // 步骤 4: 错误处理 - 返回错误响应
    res.status(500).json({
      code: 500,
      message: 'Internal server error during chat processing',
    });
  }
});
```

### 3.3 共享的核心逻辑

以下逻辑在 Webhook 和 Chat API 中**完全相同**：

1. **LLM 调用**: `llmService.chat(userId, message)`
2. **会话管理**: 通过 userId 维护独立的对话历史
3. **重试机制**: LLM 调用失败时自动重试 (maxRetries 次)
4. **降级回复**: 所有重试失败后返回 fallbackResponse
5. **历史裁剪**: 保持历史消息不超过 maxHistoryLength * 2 条

---

## 4. 输入验证要求

### 4.1 API Key 验证

```typescript
// 验证中间件
function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      code: 401,
      message: 'Missing API key: X-API-Key header is required',
    });
  }
  
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      code: 401,
      message: 'Invalid API key',
    });
  }
  
  next();
}
```

### 4.2 请求体验证

| 字段 | 验证规则 | 错误消息 |
|------|---------|---------|
| userId | 必填 | Missing required fields: userId and message are required |
| userId | 类型为 string | Invalid field types: userId and message must be strings |
| userId | 长度 1-100 | Invalid userId: must be between 1 and 100 characters |
| message | 必填 | Missing required fields: userId and message are required |
| message | 类型为 string | Invalid field types: userId and message must be strings |
| message | 长度 1-5000 | Invalid message: must be between 1 and 5000 characters |

### 4.3 验证流程

```
请求到达
    │
    ▼
Content-Type 检查
    │
    ├── 非 application/json ──► 415 Unsupported Media Type
    │
    ▼
X-API-Key 检查
    │
    ├── 缺失 ──► 401 Missing API key
    │
    ├── 无效 ──► 401 Invalid API key
    │
    ▼
请求体解析
    │
    ├── 解析失败 ──► 400 Invalid JSON body
    │
    ▼
字段存在性检查
    │
    ├── 缺失字段 ──► 400 Missing required fields
    │
    ▼
字段类型检查
    │
    ├── 类型错误 ──► 400 Invalid field types
    │
    ▼
字段长度检查
    │
    ├── 长度超限 ──► 400 Invalid userId/message length
    │
    ▼
验证通过，继续处理
```

---

## 5. 错误处理流程

### 5.1 错误码定义

| 错误码 | HTTP 状态码 | 说明 | 示例消息 |
|--------|------------|------|---------|
| 0 | 200 | 成功 | success |
| 400 | 400 | 请求参数错误 | Missing required fields: userId and message are required |
| 401 | 401 | 认证失败 | Invalid API key |
| 415 | 415 | 媒体类型不支持 | Content-Type must be application/json |
| 500 | 500 | 服务器内部错误 | Internal server error during chat processing |

### 5.2 错误响应格式

```typescript
interface ErrorResponse {
  code: number;
  message: string;
}
```

### 5.3 错误处理策略

| 错误类型 | 处理方式 | 日志记录 |
|---------|---------|---------|
| 认证错误 | 返回 401，不暴露系统信息 | 记录 IP 和请求头 |
| 参数验证错误 | 返回 400，明确指出错误字段 | 不记录 |
| JSON 解析错误 | 返回 400，提示格式错误 | 记录原始请求体 |
| LLM 调用错误 | 返回 500，使用降级消息 | 记录完整错误堆栈 |
| 未知错误 | 返回 500，通用错误消息 | 记录完整错误堆栈 |

---

## 6. 安全考量

### 6.1 认证机制

| 安全措施 | 说明 |
|---------|------|
| API Key 认证 | 通过 X-API-Key 请求头验证调用者身份 |
| 环境变量存储 | API Key 存储在环境变量中，不硬编码 |
| 不记录敏感信息 | 日志中不记录完整的 API Key |

### 6.2 输入安全

| 安全措施 | 说明 |
|---------|------|
| 输入长度限制 | userId ≤ 100 字符，message ≤ 5000 字符 |
| 类型验证 | 强制 userId 和 message 为 string 类型 |
| JSON 格式验证 | 强制 Content-Type 为 application/json |

### 6.3 速率限制 (建议)

```typescript
// 建议添加速率限制中间件
import rateLimit from 'express-rate-limit';

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 60,              // 每个 IP 最多 60 次请求
  message: {
    code: 429,
    message: 'Too many requests, please try again later',
  },
});

router.post('/chat', chatLimiter, authenticateApiKey, handler);
```

### 6.4 安全配置

需要在 `.env` 中添加：

```bash
# Chat API 安全配置
API_KEY=your-secure-api-key-here
```

---

## 7. 示例请求和响应

### 7.1 成功请求示例

#### 请求

```http
POST /api/chat HTTP/1.1
Host: localhost:3000
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": "user-123",
  "message": "你好，请介绍一下你自己"
}
```

#### 响应

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "user-123",
    "reply": "你好！我是一个 AI 助手，可以帮助你回答问题、提供建议和进行对话。有什么我可以帮助你的吗？",
    "timestamp": "2026-03-14T10:30:00.000Z"
  }
}
```

### 7.2 多轮对话示例

#### 第一次请求

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": "user-123",
  "message": "我叫小明"
}
```

#### 第一次响应

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "user-123",
    "reply": "你好小明！很高兴认识你。有什么我可以帮助你的吗？",
    "timestamp": "2026-03-14T10:31:00.000Z"
  }
}
```

#### 第二次请求 (同一用户)

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": "user-123",
  "message": "我叫什么名字？"
}
```

#### 第二次响应 (保持上下文)

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "user-123",
    "reply": "你叫小明，这是我们刚才对话时你告诉我的。",
    "timestamp": "2026-03-14T10:32:00.000Z"
  }
}
```

### 7.3 错误请求示例

#### 缺少 API Key

```http
POST /api/chat HTTP/1.1
Content-Type: application/json

{
  "userId": "user-123",
  "message": "你好"
}
```

```json
{
  "code": 401,
  "message": "Missing API key: X-API-Key header is required"
}
```

#### 无效 API Key

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: invalid-key

{
  "userId": "user-123",
  "message": "你好"
}
```

```json
{
  "code": 401,
  "message": "Invalid API key"
}
```

#### 缺少必填字段

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": "user-123"
}
```

```json
{
  "code": 400,
  "message": "Missing required fields: userId and message are required"
}
```

#### 字段类型错误

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": 123,
  "message": "你好"
}
```

```json
{
  "code": 400,
  "message": "Invalid field types: userId and message must be strings"
}
```

#### 消息过长

```http
POST /api/chat HTTP/1.1
Content-Type: application/json
X-API-Key: your-api-key-here

{
  "userId": "user-123",
  "message": "...(超过5000字符的消息)..."
}
```

```json
{
  "code": 400,
  "message": "Invalid message: must be between 1 and 5000 characters"
}
```

---

## 8. 实现清单

### 8.1 代码变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| src/routes/api.ts | 修改 | 添加 POST /chat 端点 |
| src/middleware/auth.middleware.ts | 新增 | API Key 认证中间件 |
| src/types/index.ts | 修改 | 添加 ChatRequest/ChatResponse 类型 |
| .env.example | 修改 | 添加 API_KEY 配置项 |

### 8.2 新增类型定义

```typescript
// src/types/index.ts

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
```

### 8.3 新增中间件

```typescript
// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    res.status(401).json({
      code: 401,
      message: 'Missing API key: X-API-Key header is required',
    });
    return;
  }
  
  if (typeof apiKey !== 'string' || apiKey !== process.env.API_KEY) {
    res.status(401).json({
      code: 401,
      message: 'Invalid API key',
    });
    return;
  }
  
  next();
}
```

### 8.4 路由实现

```typescript
// src/routes/api.ts (新增部分)

import { authenticateApiKey } from '../middleware/auth.middleware';
import { llmService } from '../services/llm.service';
import { ChatRequest, ChatResponse } from '../types';

router.post('/chat', authenticateApiKey, async (req, res) => {
  const { userId, message } = req.body as ChatRequest;
  
  // 参数验证
  if (!userId || !message) {
    return res.status(400).json({
      code: 400,
      message: 'Missing required fields: userId and message are required',
    });
  }
  
  if (typeof userId !== 'string' || typeof message !== 'string') {
    return res.status(400).json({
      code: 400,
      message: 'Invalid field types: userId and message must be strings',
    });
  }
  
  if (userId.length < 1 || userId.length > 100) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid userId: must be between 1 and 100 characters',
    });
  }
  
  if (message.length < 1 || message.length > 5000) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid message: must be between 1 and 5000 characters',
    });
  }
  
  try {
    // 调用 LLM 服务 (与 Webhook 完全相同的逻辑)
    const reply = await llmService.chat(userId, message);
    
    const response: ChatResponse = {
      code: 0,
      message: 'success',
      data: {
        userId,
        reply,
        timestamp: new Date().toISOString(),
      },
    };
    
    res.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error during chat processing',
    });
  }
});
```

---

## 9. 测试验证

### 9.1 单元测试

```typescript
describe('POST /api/chat', () => {
  const validApiKey = 'test-api-key';
  
  beforeEach(() => {
    process.env.API_KEY = validApiKey;
  });
  
  describe('认证测试', () => {
    it('should return 401 when API key is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ userId: 'test', message: 'hello' });
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe(401);
    });
    
    it('should return 401 when API key is invalid', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', 'invalid-key')
        .send({ userId: 'test', message: 'hello' });
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe(401);
    });
  });
  
  describe('参数验证测试', () => {
    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ message: 'hello' });
      
      expect(response.status).toBe(400);
      expect(response.body.code).toBe(400);
    });
    
    it('should return 400 when message is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'test' });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 400 when userId exceeds max length', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'a'.repeat(101), message: 'hello' });
      
      expect(response.status).toBe(400);
    });
    
    it('should return 400 when message exceeds max length', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'test', message: 'a'.repeat(5001) });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('功能测试', () => {
    it('should return 200 with valid response', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'test-user', message: '你好' });
      
      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.userId).toBe('test-user');
      expect(response.body.data.reply).toBeDefined();
      expect(response.body.data.timestamp).toBeDefined();
    });
    
    it('should maintain conversation context', async () => {
      // 第一次对话
      await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'context-user', message: '我叫小红' });
      
      // 第二次对话
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', validApiKey)
        .send({ userId: 'context-user', message: '我叫什么名字？' });
      
      expect(response.body.data.reply).toContain('小红');
    });
  });
});
```

### 9.2 集成测试

```bash
# 启动服务
npm run dev

# 测试健康检查
curl http://localhost:3000/health

# 测试 Chat API (成功)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "你好"}'

# 预期响应
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "test-user",
    "reply": "...",
    "timestamp": "..."
  }
}

# 测试 Chat API (认证失败)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "message": "你好"}'

# 预期响应
{
  "code": 401,
  "message": "Missing API key: X-API-Key header is required"
}
```

---

## 10. 验收标准

### 10.1 功能验收

- [ ] POST /api/chat 端点正确响应
- [ ] API Key 认证正常工作
- [ ] 参数验证覆盖所有场景
- [ ] LLM 调用与 Webhook 行为一致
- [ ] 会话上下文正确维护
- [ ] 错误响应格式正确

### 10.2 安全验收

- [ ] 无 API Key 时返回 401
- [ ] 无效 API Key 时返回 401
- [ ] 输入长度限制生效
- [ ] 类型验证生效

### 10.3 性能验收

- [ ] 响应时间与 Webhook 相当
- [ ] 无内存泄漏

---

## 11. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API Key 泄露 | 未授权访问 | 定期轮换密钥，使用 HTTPS |
| 速率限制缺失 | 服务过载 | 添加速率限制中间件 |
| 会话内存泄漏 | 内存耗尽 | 添加会话过期清理机制 |
| LLM 响应延迟 | 请求超时 | 设置合理的 timeout |

---

## 12. 输出物

- [ ] src/routes/api.ts (更新)
- [ ] src/middleware/auth.middleware.ts (新增)
- [ ] src/types/index.ts (更新)
- [ ] .env.example (更新)
- [ ] 单元测试文件

---

## 13. 审批

| 角色 | 姓名 | 日期 | 状态 |
|------|------|------|------|
| 开发者 | | | 待审批 |
| 审核者 | | | 待审批 |

---

**请审核此规范文档，确认后我将开始实施。**
