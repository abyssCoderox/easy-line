# Spec: Webhook处理模块

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-005 |
| 任务名称 | Webhook处理模块开发 |
| 优先级 | P0 (最高) |
| 预计工时 | 3小时 |
| 依赖任务 | SPEC-001, SPEC-002, SPEC-003 |
| 负责模块 | src/routes/webhook.ts, src/handlers/ |

---

## 1. 任务目标

实现 LINE Webhook 路由和消息处理逻辑，接收 LINE 平台推送的消息事件，调用 LLM 服务生成回复，并通过 LINE SDK 发送回复。

## 2. 任务范围

### 2.1 包含内容

- [ ] Webhook 路由实现
- [ ] 消息事件处理
- [ ] 文本消息处理
- [ ] 错误处理中间件
- [ ] 健康检查接口

### 2.2 不包含内容

- 图片/视频消息处理
- 富媒体消息生成
- 意图识别

---

## 3. 详细任务清单

### 3.1 Webhook 路由实现

**文件路径：** `src/routes/webhook.ts`

```typescript
import { Router } from 'express';
import { lineService } from '../services/line.service';
import { llmService } from '../services/llm.service';
import { WebhookEvent } from '../types';

const router = Router();

router.post('/', lineService.getMiddleware(), async (req, res) => {
  try {
    const events: WebhookEvent[] = req.body.events;
    
    await Promise.all(events.map(handleEvent));
    
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'error' });
  }
});

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== 'message') return;
  if (event.message.type !== 'text') return;
  
  const userId = event.source.userId!;
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  
  try {
    const reply = await llmService.chat(userId, userMessage);
    
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: reply,
    }]);
  } catch (error) {
    console.error('Handle event error:', error);
    
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: '抱歉，处理您的消息时出现错误，请稍后再试。',
    }]);
  }
}

export default router;
```

### 3.2 错误处理中间件

**文件路径：** `src/middleware/error.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    code: statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    code: 404,
    message: 'Not Found',
  });
}
```

### 3.3 管理API路由

**文件路径：** `src/routes/api.ts`

```typescript
import { Router } from 'express';
import { schedulerService } from '../services/scheduler.service';
import { lineService } from '../services/line.service';

const router = Router();

router.get('/tasks', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      tasks: schedulerService.getTaskStatus(),
    },
  });
});

router.get('/tasks/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json({
    code: 0,
    message: 'success',
    data: {
      logs: schedulerService.getLogs(limit),
    },
  });
});

router.post('/messages/push', async (req, res) => {
  try {
    const { targetType, targetIds, messages } = req.body;
    
    if (targetType === 'user') {
      for (const userId of targetIds) {
        await lineService.pushMessage(userId, messages);
      }
    } else {
      await lineService.multicast(targetIds, messages);
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: { sentCount: targetIds.length },
    });
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message,
    });
  }
});

export default router;
```

### 3.4 入口文件整合

**文件路径：** `src/index.ts`

```typescript
import express from 'express';
import dotenv from 'dotenv';
import { config, validateConfig } from './config';
import { lineService } from './services/line.service';
import { schedulerService } from './services/scheduler.service';
import webhookRoutes from './routes/webhook';
import apiRoutes from './routes/api';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

dotenv.config();

try {
  validateConfig();
} catch (error) {
  console.error('Config validation failed:', error);
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.get('/ready', (req, res) => {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
  });
});

app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  schedulerService.loadTasks();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  schedulerService.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
```

---

## 4. API接口说明

### 4.1 POST /webhook

接收 LINE 平台推送的消息事件。

**请求头：**
| Header | 说明 |
|--------|------|
| X-Line-Signature | LINE 签名 |
| Content-Type | application/json |

**响应：**
```json
{ "status": "ok" }
```

### 4.2 GET /health

健康检查接口。

**响应：**
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T00:00:00.000Z",
  "services": {
    "line": "connected",
    "scheduler": "running",
    "tasks": 1
  }
}
```

### 4.3 GET /api/tasks

获取定时任务状态。

### 4.4 POST /api/messages/push

主动推送消息。

---

## 5. 验收标准

### 5.1 功能验收

- [ ] Webhook 签名验证通过
- [ ] 文本消息正确处理
- [ ] LLM 回复正常生成
- [ ] LINE 消息回复成功
- [ ] 错误时返回降级回复
- [ ] 健康检查正常

### 5.2 错误处理

- [ ] 签名验证失败返回 401
- [ ] LLM 错误返回降级回复
- [ ] 未处理消息类型静默跳过

---

## 6. 测试验证

### 6.1 本地测试 (ngrok)

```bash
# 启动服务
npm run dev

# 启动 ngrok
ngrok http 3000

# 配置 LINE Webhook URL
# https://xxx.ngrok.io/webhook
```

### 6.2 测试消息发送

在 LINE 客户端发送消息，验证：
1. 消息被正确接收
2. LLM 生成回复
3. 收到回复消息

---

## 7. 输出物

- [ ] src/routes/webhook.ts
- [ ] src/routes/api.ts
- [ ] src/middleware/error.middleware.ts
- [ ] 更新 src/index.ts
