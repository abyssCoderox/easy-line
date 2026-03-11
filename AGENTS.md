# AGENTS.md - LINE Bot Demo 开发规范

## 文档信息

| 项目名称 | LINE Bot 智能消息处理系统 Demo |
|---------|-------------------------------|
| 文档版本 | V1.0 |
| 创建日期 | 2026-03-12 |
| 适用范围 | Demo版本开发 |

---

## 1. 项目概述

### 1.1 项目目标

在**一周内**完成一个可演示的 LINE Bot Demo，实现：
- LINE 平台消息正常收发
- 大模型智能对话功能
- 定时消息推送功能
- 完整的聊天交互演示流程

### 1.2 技术栈

| 层级 | 技术选型 | 版本 |
|------|---------|------|
| 运行时 | Node.js | 18+ |
| 语言 | TypeScript | 5.x |
| Web框架 | Express | 4.x |
| LINE SDK | @line/bot-sdk | 7.x |
| LLM框架 | LangChain.js | 0.1.x |
| 定时任务 | node-cron | 3.x |
| HTTP客户端 | axios | 1.x |

---

## 2. 开发流程规范

### 2.1 任务执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                      任务执行流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 阅读 Spec 文档                                          │
│       │                                                     │
│       ▼                                                     │
│  2. 理解任务范围和依赖                                       │
│       │                                                     │
│       ▼                                                     │
│  3. 编写代码实现                                            │
│       │                                                     │
│       ▼                                                     │
│  4. 本地测试验证                                            │
│       │                                                     │
│       ▼                                                     │
│  5. 提交代码                                                │
│       │                                                     │
│       ▼                                                     │
│  6. 更新任务状态                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 任务优先级

| 优先级 | 说明 | 示例 |
|--------|------|------|
| P0 | 最高优先级，核心功能 | Webhook处理、消息回复 |
| P1 | 高优先级，重要功能 | 定时任务、LLM集成 |
| P2 | 中优先级，增强功能 | 日志记录、错误处理 |
| P3 | 低优先级，优化功能 | 性能优化、UI美化 |

### 2.3 任务依赖关系

```
SPEC-001 (项目初始化)
    │
    ├──► SPEC-002 (LINE服务)
    │        │
    │        └──► SPEC-004 (定时任务)
    │
    └──► SPEC-003 (LLM服务)
             │
             └──► SPEC-005 (Webhook处理)
```

---

## 3. 代码规范

### 3.1 文件命名

| 类型 | 命名规范 | 示例 |
|------|---------|------|
| 服务类 | {name}.service.ts | line.service.ts |
| 路由 | {name}.ts | webhook.ts |
| 中间件 | {name}.middleware.ts | error.middleware.ts |
| 类型 | index.ts | types/index.ts |
| 配置 | index.ts 或 {name}.json | config/index.ts |

### 3.2 类命名

```typescript
// 使用 PascalCase，以 Service 结尾
export class LineService {}
export class LLMService {}
export class SchedulerService {}
```

### 3.3 接口命名

```typescript
// 使用 PascalCase，以 I 开头（可选）或直接描述
export interface TaskConfig {}
export interface AppConfig {}
export interface ApiResponse<T = any> {}
```

### 3.4 变量命名

```typescript
// 使用 camelCase
const userId = 'U123456';
const taskConfigs = [];

// 常量使用 UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT = 30000;
```

### 3.5 函数命名

```typescript
// 使用 camelCase，动词开头
async function sendMessage() {}
function getTaskStatus() {}
function validateConfig() {}
private renderTemplate() {}
```

### 3.6 代码注释

```typescript
/**
 * 执行定时任务
 * @param config 任务配置
 * @returns Promise<void>
 */
private async executeTask(config: TaskConfig): Promise<void> {
  // 1. 调用第三方API获取数据
  const response = await axios({...});
  
  // 2. 渲染消息模板
  const message = this.renderTemplate(...);
  
  // 3. 推送消息
  await this.client.multicast(...);
}
```

---

## 4. 接口调用规范

### 4.1 LINE SDK 使用

```typescript
// 正确：使用 SDK 提供的方法
import { messagingApi } from '@line/bot-sdk';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// 回复消息
await client.replyMessage({
  replyToken,
  messages: [{ type: 'text', text: 'Hello' }],
});

// 推送消息
await client.pushMessage({
  to: userId,
  messages: [{ type: 'text', text: 'Hello' }],
});

// 批量推送
await client.multicast({
  to: [userId1, userId2],
  messages: [{ type: 'text', text: 'Hello' }],
});
```

### 4.2 Webhook 签名验证

```typescript
// 使用 SDK 中间件自动验证
import { middleware } from '@line/bot-sdk';

const middlewareConfig = {
  channelSecret: config.channelSecret,
};

app.post('/webhook', middleware(middlewareConfig), handler);
```

### 4.3 错误处理

```typescript
try {
  await client.replyMessage(...);
} catch (error: any) {
  console.error('LINE API error:', {
    message: error.message,
    statusCode: error.statusCode,
    originalError: error.originalError,
  });
  
  // 根据错误类型处理
  if (error.statusCode === 429) {
    // 限流处理
  } else if (error.statusCode === 401) {
    // 认证失败
  }
}
```

---

## 5. 数据操作规范

### 5.1 配置文件读取

```typescript
// JSON 配置文件
import taskConfigFile from '../config/tasks.json';

// 环境变量
import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
};
```

### 5.2 内存存储

```typescript
// 使用 Map 存储会话
private sessions: Map<string, BufferMemory> = new Map();

// 使用 Map 存储任务
private tasks: Map<string, cron.ScheduledTask> = new Map();

// 使用数组存储日志
private logs: TaskExecutionLog[] = [];
```

### 5.3 模板渲染

```typescript
// 简单变量替换
private renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : '';
  });
}

// 使用示例
const template = '天气: {weather}, 温度: {temp}°C';
const data = { weather: '晴', temp: 25 };
const result = renderTemplate(template, data);
// 输出: '天气: 晴, 温度: 25°C'
```

---

## 6. 错误处理规范

### 6.1 全局错误处理

```typescript
// src/middleware/error.middleware.ts
export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.statusCode || 500).json({
    code: err.statusCode || 500,
    message: err.message || 'Internal Server Error',
  });
}
```

### 6.2 服务层错误处理

```typescript
// 服务方法中的错误处理
async chat(userId: string, message: string): Promise<string> {
  try {
    const response = await this.chain.call({ input: message });
    return response.response;
  } catch (error: any) {
    console.error('LLM chat error:', error);
    return this.getFallbackResponse();
  }
}

private getFallbackResponse(): string {
  return '抱歉，我暂时无法回答，请稍后再试。';
}
```

### 6.3 错误码定义

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 资源不存在 |
| 2001 | 签名验证失败 |
| 3001 | 服务内部错误 |
| 3002 | 第三方服务错误 |

---

## 7. 日志规范

### 7.1 日志级别

```typescript
// 使用 console 进行日志输出
console.log('Info: Server started');      // 信息
console.warn('Warning: Rate limit approaching');  // 警告
console.error('Error: API call failed', error);   // 错误
```

### 7.2 日志格式

```typescript
// 结构化日志
console.log(`Task loaded: ${config.name} (${config.schedule})`);
console.log(`Task completed: ${config.name} (${duration}ms)`);
console.error(`Task failed: ${config.name}`, error);
```

### 7.3 敏感信息处理

```typescript
// 不要记录敏感信息
console.log('API response:', {
  status: response.status,
  // 不要记录完整的 access token
  // accessToken: response.data.accessToken,  // ❌
});
```

---

## 8. 测试规范

### 8.1 单元测试

```typescript
describe('LineService', () => {
  it('should initialize with config', () => {
    const service = new LineService({
      channelSecret: 'test-secret',
      channelAccessToken: 'test-token',
    });
    expect(service).toBeDefined();
  });
});
```

### 8.2 集成测试

```bash
# 启动服务
npm run dev

# 健康检查
curl http://localhost:3000/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

### 8.3 本地测试 (ngrok)

```bash
# 1. 启动服务
npm run dev

# 2. 启动 ngrok
ngrok http 3000

# 3. 在 LINE Developers 配置 Webhook URL
# https://xxx.ngrok.io/webhook

# 4. 在 LINE 客户端发送消息测试
```

---

## 9. Git 提交规范

### 9.1 提交消息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 9.2 Type 类型

| Type | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug 修复 |
| docs | 文档更新 |
| style | 代码格式 |
| refactor | 重构 |
| test | 测试 |
| chore | 构建/工具 |

### 9.3 提交示例

```bash
feat(line): 实现 LINE 服务模块

- 添加 LineService 类
- 实现消息回复功能
- 实现消息推送功能

Closes #SPEC-002
```

---

## 10. 环境配置

### 10.1 环境变量

```bash
# .env.example

# 服务配置
PORT=3000
NODE_ENV=development

# LINE配置
LINE_CHANNEL_SECRET=your-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-access-token

# OpenAI配置
OPENAI_API_KEY=sk-your-api-key

# 第三方API密钥（可选）
WEATHER_API_KEY=your-weather-api-key
```

### 10.2 配置验证

```typescript
export function validateConfig(): void {
  const required = [
    'LINE_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'OPENAI_API_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

---

## 11. 部署规范

### 11.1 启动命令

```bash
# 开发环境
npm run dev

# 生产环境
npm run build
npm start
```

### 11.2 进程管理

```typescript
// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  schedulerService.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

### 11.3 健康检查

```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      line: 'connected',
      scheduler: 'running',
      tasks: schedulerService.getTaskStatus().length,
    },
  });
});
```

---

## 12. 附录

### 12.1 任务清单汇总

| 任务ID | 任务名称 | 优先级 | 预计工时 | 依赖 |
|--------|---------|--------|---------|------|
| SPEC-001 | 项目初始化 | P0 | 2h | - |
| SPEC-002 | LINE服务模块 | P0 | 3h | SPEC-001 |
| SPEC-003 | LLM服务模块 | P0 | 3h | SPEC-001 |
| SPEC-004 | 定时任务模块 | P1 | 4h | SPEC-001, SPEC-002 |
| SPEC-005 | Webhook处理 | P0 | 3h | SPEC-001, SPEC-002, SPEC-003 |

### 12.2 参考文档

- [LINE Messaging API 文档](https://developers.line.biz/en/docs/messaging-api/)
- [@line/bot-sdk GitHub](https://github.com/line/line-bot-sdk-nodejs)
- [LangChain.js 文档](https://js.langchain.com/docs/)
- [node-cron 文档](https://github.com/node-cron/node-cron)

### 12.3 修订历史

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| V1.0 | 2026-03-12 | 初始版本 |
