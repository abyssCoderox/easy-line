# Spec: LINE服务模块

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-002 |
| 任务名称 | LINE服务模块开发 |
| 优先级 | P0 (最高) |
| 预计工时 | 3小时 |
| 依赖任务 | SPEC-001 (项目初始化) |
| 负责模块 | src/services/line.service.ts |

---

## 1. 任务目标

实现 LINE Bot 的核心服务模块，封装 `@line/bot-sdk` 的客户端功能，提供消息接收、回复、推送等能力。

## 2. 任务范围

### 2.1 包含内容

- [ ] LineService 类实现
- [ ] 签名验证中间件封装
- [ ] 消息回复功能 (replyMessage)
- [ ] 消息推送功能 (pushMessage)
- [ ] 批量推送功能 (multicast)
- [ ] 用户信息获取功能
- [ ] 单元测试

### 2.2 不包含内容

- Webhook路由实现 (SPEC-004)
- 消息处理逻辑 (SPEC-005)

---

## 3. 详细任务清单

### 3.1 LineService 类实现

**文件路径：** `src/services/line.service.ts`

```typescript
import { 
  messagingApi, 
  middleware, 
  MiddlewareConfig,
  webhook
} from '@line/bot-sdk';

export interface LineConfig {
  channelSecret: string;
  channelAccessToken: string;
}

export class LineService {
  private client: messagingApi.MessagingApiClient;
  private middlewareConfig: MiddlewareConfig;
  
  constructor(config: LineConfig) {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: config.channelAccessToken,
    });
    this.middlewareConfig = {
      channelSecret: config.channelSecret,
    };
  }
  
  getMiddleware() {
    return middleware(this.middlewareConfig);
  }
  
  async replyMessage(replyToken: string, messages: messagingApi.Message[]) {
    return this.client.replyMessage({
      replyToken,
      messages,
    });
  }
  
  async pushMessage(to: string, messages: messagingApi.Message[]) {
    return this.client.pushMessage({
      to,
      messages,
    });
  }
  
  async multicast(to: string[], messages: messagingApi.Message[]) {
    return this.client.multicast({
      to,
      messages,
    });
  }
  
  async getUserProfile(userId: string): Promise<messagingApi.ProfileResponse> {
    return this.client.getProfile(userId);
  }
}
```

### 3.2 配置加载

**文件路径：** `src/config/index.ts`

```typescript
import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  line: {
    channelSecret: process.env.LINE_CHANNEL_SECRET!,
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
  },
};

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

### 3.3 服务实例导出

**更新 src/services/line.service.ts:**

```typescript
import { config } from '../config';

export const lineService = new LineService({
  channelSecret: config.line.channelSecret,
  channelAccessToken: config.line.channelAccessToken,
});
```

### 3.4 消息类型定义

**更新 src/types/index.ts:**

```typescript
import { messagingApi } from '@line/bot-sdk';

export type TextMessage = messagingApi.TextMessage;
export type ImageMessage = messagingApi.ImageMessage;
export type FlexMessage = messagingApi.FlexMessage;
export type Message = messagingApi.Message;
export type WebhookEvent = webhook.Event;
```

---

## 4. API接口说明

### 4.1 getMiddleware()

获取 LINE 签名验证中间件。

**返回值：** Express 中间件函数

**使用示例：**
```typescript
app.post('/webhook', lineService.getMiddleware(), handler);
```

### 4.2 replyMessage()

回复用户消息。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| replyToken | string | 回复令牌（30秒有效） |
| messages | Message[] | 消息数组（最多5条） |

**返回值：** Promise<void>

**使用示例：**
```typescript
await lineService.replyMessage(replyToken, [{
  type: 'text',
  text: '你好！'
}]);
```

### 4.3 pushMessage()

主动推送消息给用户。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| to | string | 用户ID |
| messages | Message[] | 消息数组 |

**返回值：** Promise<void>

**使用示例：**
```typescript
await lineService.pushMessage('U1234567890', [{
  type: 'text',
  text: '这是一条推送消息'
}]);
```

### 4.4 multicast()

批量推送消息给多个用户。

**参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| to | string[] | 用户ID数组 |
| messages | Message[] | 消息数组 |

**返回值：** Promise<void>

**使用示例：**
```typescript
await lineService.multicast(['U1234', 'U5678'], [{
  type: 'text',
  text: '群发消息'
}]);
```

---

## 5. 验收标准

### 5.1 功能验收

- [ ] LineService 类正确初始化
- [ ] 签名验证中间件正常工作
- [ ] replyMessage 发送成功
- [ ] pushMessage 发送成功
- [ ] multicast 发送成功
- [ ] getUserProfile 返回正确

### 5.2 错误处理

- [ ] 无效 token 时抛出错误
- [ ] 网络错误时正确处理
- [ ] 环境变量缺失时提示

---

## 6. 测试验证

### 6.1 单元测试

```typescript
describe('LineService', () => {
  it('should initialize with config', () => {
    const service = new LineService({
      channelSecret: 'test-secret',
      channelAccessToken: 'test-token',
    });
    expect(service).toBeDefined();
  });
  
  it('should return middleware function', () => {
    const middleware = lineService.getMiddleware();
    expect(typeof middleware).toBe('function');
  });
});
```

### 6.2 集成测试

使用 ngrok 进行本地测试：

```bash
# 启动服务
npm run dev

# 启动 ngrok
ngrok http 3000

# 在 LINE Developers 配置 Webhook URL
# https://xxx.ngrok.io/webhook
```

---

## 7. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Channel Secret 错误 | 签名验证失败 | 启动时验证配置 |
| Access Token 过期 | API调用失败 | 提供错误提示 |
| 消息发送频率限制 | 被限流 | 添加重试机制 |

---

## 8. 输出物

- [ ] src/services/line.service.ts
- [ ] src/config/index.ts
- [ ] 更新 src/types/index.ts
- [ ] 单元测试文件
