# Spec: LangChain Agent 集成（全面迁移）

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-009 |
| 任务名称 | LangChain Agent 集成 |
| 优先级 | P0 (最高) |
| 预计工时 | 8小时 |
| 依赖任务 | SPEC-002, SPEC-003, SPEC-005, SPEC-006 |
| 负责模块 | AgentService, Tools, Webhook, API |

---

## 1. 任务目标

基于 LangChain Agent 重构消息处理流程，将现有的意图识别、任务管理、工具调用统一到 Agent 框架下，实现：
- 统一的 Agent 入口处理所有用户消息
- 任务管理功能封装为 Tool
- 第三方工具调用由 Agent 自动决策
- 简化 Webhook 和 API 路由代码

## 2. 任务范围

### 2.1 包含内容

- [ ] 创建 AgentService 服务
- [ ] 封装任务管理工具（create_task, list_tasks, delete_task, enable_task, disable_task）
- [ ] 封装告警查询工具（alert_query）
- [ ] 封装设备状态工具（device_status）
- [ ] 重构 Webhook 路由
- [ ] 重构 Chat API 路由
- [ ] 更新类型定义
- [ ] 更新环境变量配置

### 2.2 不包含内容

- 第三方 API 的实际实现（使用 Mock 数据测试）
- 复杂的会话持久化（保持内存存储）
- 多模型支持（仅支持 OpenAI Function Calling）

---

## 3. 详细任务清单

### 3.1 安装依赖

```bash
npm install zod
```

### 3.2 创建工具目录结构

```
src/services/tools/
├── index.ts           # 工具导出
├── task.tools.ts      # 任务管理工具
├── alert.tool.ts      # 告警查询工具
└── device.tool.ts     # 设备状态工具
```

### 3.3 实现任务管理工具

**文件路径**: `src/services/tools/task.tools.ts`

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { taskManagerService } from '../task-manager.service';

let currentUserId: string = '';

export function setTaskContext(userId: string) {
  currentUserId = userId;
}

export const createTaskTool = new DynamicStructuredTool({
  name: 'create_task',
  description: '创建定时任务。当用户想设置提醒、定时通知、定时推送时使用此工具。支持自然语言时间描述如"每天早上9点"、"每周一10点"等。',
  schema: z.object({
    schedule: z.string().describe('时间表达式，可以是Cron格式如"0 9 * * *"或自然语言如"每天早上9点"'),
    taskName: z.string().optional().describe('任务名称，如"开会提醒"、"吃药提醒"'),
  }),
  func: async ({ schedule, taskName }) => {
    try {
      const result = await taskManagerService.createTaskFromNaturalLanguage(
        currentUserId,
        schedule,
        undefined,
        taskName
      );
      
      return JSON.stringify({
        success: result.success,
        message: result.message,
        taskId: result.taskId,
        schedule: result.schedule,
        nextExecuteTime: result.nextExecuteTime,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const listTasksTool = new DynamicStructuredTool({
  name: 'list_tasks',
  description: '查看用户的定时任务列表。当用户想查看任务、查看提醒、我的任务时使用。',
  schema: z.object({}),
  func: async () => {
    try {
      const tasks = taskManagerService.getUserTasks(currentUserId);
      
      if (tasks.length === 0) {
        return JSON.stringify({ success: true, message: '您还没有创建任何定时任务。', tasks: [] });
      }
      
      const taskList = tasks.map((task, index) => ({
        index: index + 1,
        taskId: task.taskId,
        taskName: task.taskName,
        schedule: task.schedule,
        enabled: task.enabled,
        nextExecuteTime: task.nextExecuteTime,
      }));
      
      return JSON.stringify({
        success: true,
        message: `您有 ${tasks.length} 个定时任务`,
        tasks: taskList,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const deleteTaskTool = new DynamicStructuredTool({
  name: 'delete_task',
  description: '删除定时任务。当用户想删除任务、取消提醒时使用。需要提供任务ID。',
  schema: z.object({
    taskId: z.string().describe('要删除的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.deleteTask(currentUserId, taskId);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const enableTaskTool = new DynamicStructuredTool({
  name: 'enable_task',
  description: '启用定时任务。当用户想启用任务、开启提醒时使用。',
  schema: z.object({
    taskId: z.string().describe('要启用的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.updateTaskStatus(currentUserId, taskId, true);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const disableTaskTool = new DynamicStructuredTool({
  name: 'disable_task',
  description: '禁用定时任务。当用户想禁用任务、暂停提醒时使用。',
  schema: z.object({
    taskId: z.string().describe('要禁用的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.updateTaskStatus(currentUserId, taskId, false);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
```

### 3.4 实现告警查询工具

**文件路径**: `src/services/tools/alert.tool.ts`

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

export const alertQueryTool = new DynamicStructuredTool({
  name: 'alert_query',
  description: '查询系统告警信息。当用户询问告警、报警、警报、监控问题、异常时使用此工具。',
  schema: z.object({
    level: z.enum(['critical', 'warning', 'info', 'all'])
      .optional()
      .describe('告警级别筛选：critical(严重)、warning(警告)、info(信息)、all(全部)'),
    limit: z.number().min(1).max(50).optional()
      .describe('返回条数限制，默认10条'),
    device: z.string().optional()
      .describe('设备名称筛选'),
  }),
  func: async ({ level = 'all', limit = 10, device }) => {
    try {
      const apiUrl = process.env.ALERT_API_URL;
      
      if (!apiUrl) {
        return JSON.stringify({
          success: false,
          error: 'ALERT_API_URL not configured',
          alerts: [],
        });
      }
      
      const response = await axios.get(apiUrl, {
        params: { level, limit, device },
        timeout: 10000,
      });
      
      const alerts = response.data?.data?.alerts || [];
      
      return JSON.stringify({
        success: true,
        total: alerts.length,
        alerts: alerts.map((alert: any) => ({
          id: alert.id,
          level: alert.level,
          device: alert.device,
          message: alert.message,
          timestamp: alert.timestamp,
          status: alert.status,
        })),
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        alerts: [],
      });
    }
  },
});
```

### 3.5 实现设备状态工具

**文件路径**: `src/services/tools/device.tool.ts`

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export const deviceStatusTool = new DynamicStructuredTool({
  name: 'device_status',
  description: '查询设备运行状态。当用户询问设备状态、服务器状态、机器状态、CPU、内存时使用。',
  schema: z.object({
    deviceName: z.string().optional().describe('设备名称，不填则返回所有设备'),
  }),
  func: async ({ deviceName }) => {
    const devices = [
      { name: 'Server-01', status: 'running', cpu: 45, memory: 60, disk: 70 },
      { name: 'Server-02', status: 'running', cpu: 78, memory: 85, disk: 65 },
      { name: 'Server-03', status: 'warning', cpu: 92, memory: 88, disk: 90 },
    ];
    
    const filtered = deviceName 
      ? devices.filter(d => d.name.includes(deviceName))
      : devices;
    
    return JSON.stringify({
      success: true,
      devices: filtered,
    });
  },
});
```

### 3.6 创建工具导出

**文件路径**: `src/services/tools/index.ts`

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  setTaskContext,
} from './task.tools';
import { alertQueryTool } from './alert.tool';
import { deviceStatusTool } from './device.tool';

export const tools: DynamicStructuredTool[] = [
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  alertQueryTool,
  deviceStatusTool,
];

export { setTaskContext };
```

### 3.7 创建 AgentService

**文件路径**: `src/services/agent.service.ts`

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createOpenAIToolsAgent, AgentExecutor } from 'langchain/agents';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { config } from '../config';
import { tools, setTaskContext } from './tools';
import { logger } from './logger.service';

const SYSTEM_PROMPT = `你是一个智能运维助手，可以帮助用户：

1. 管理定时任务（创建、查看、删除、启用、禁用）
2. 查询系统告警信息
3. 查询设备运行状态
4. 进行日常对话

工具使用指南：
- 用户想设置提醒或定时通知时，使用 create_task 工具
- 用户想查看任务列表时，使用 list_tasks 工具
- 用户想删除任务时，使用 delete_task 工具（需要任务ID）
- 用户想启用/禁用任务时，使用 enable_task 或 disable_task 工具
- 用户想查看告警时，使用 alert_query 工具
- 用户想查看设备状态时，使用 device_status 工具

回复规则：
- 执行工具后，将结果以清晰友好的方式呈现给用户
- 告警信息：显示级别emoji、设备、描述、时间
- 任务信息：显示任务名称、执行时间、下次执行时间
- 如果工具执行失败，告诉用户稍后重试
- 普通对话时，友好地回复用户`;

export class AgentService {
  private model: ChatOpenAI;
  private agentExecutor: AgentExecutor | null = null;
  private sessions: Map<string, InMemoryChatMessageHistory> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.model = new ChatOpenAI({
      model: config.llm.model,
      temperature: config.llm.temperature ?? 0.7,
      apiKey: config.llm.apiKey,
      timeout: config.llm.timeout ?? 30000,
      configuration: config.llm.apiBaseUrl ? {
        baseURL: config.llm.apiBaseUrl,
      } : undefined,
    });

    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createOpenAIToolsAgent({
      llm: this.model,
      tools,
      prompt,
    });

    this.agentExecutor = AgentExecutor.fromAgentAndTools({
      agent,
      tools,
      maxIterations: 3,
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private getOrCreateHistory(userId: string): InMemoryChatMessageHistory {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new InMemoryChatMessageHistory());
    }
    return this.sessions.get(userId)!;
  }

  async run(input: string, userId: string): Promise<string> {
    await this.ensureInitialized();
    
    setTaskContext(userId);
    
    const history = this.getOrCreateHistory(userId);
    const pastMessages = await history.getMessages();

    try {
      const result = await this.agentExecutor!.invoke({
        input,
        chat_history: pastMessages,
      });

      const response = result.output as string;

      await history.addMessage(new HumanMessage(input));
      await history.addMessage(new AIMessage(response));

      await this.trimHistory(userId);

      logger.info('AgentService', 'Agent response generated', {
        userId: this.maskUserId(userId),
        inputLength: input.length,
        outputLength: response.length,
      });

      return response;
    } catch (error: any) {
      logger.error('AgentService', 'Agent execution failed', {
        userId: this.maskUserId(userId),
        error: error.message,
      });

      return this.getFallbackResponse();
    }
  }

  private async trimHistory(userId: string): Promise<void> {
    const history = this.sessions.get(userId);
    if (!history) return;

    const messages = await history.getMessages();
    const maxLength = (config.llm.maxHistoryLength ?? 6) * 2;

    if (messages.length > maxLength) {
      const newHistory = new InMemoryChatMessageHistory();
      const messagesToKeep = messages.slice(-maxLength);
      for (const msg of messagesToKeep) {
        await newHistory.addMessage(msg);
      }
      this.sessions.set(userId, newHistory);
    }
  }

  clearHistory(userId: string): void {
    this.sessions.delete(userId);
    logger.info('AgentService', 'Session cleared', {
      userId: this.maskUserId(userId),
    });
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private getFallbackResponse(): string {
    const fallbacks = [
      '抱歉，处理您的请求时遇到问题，请稍后再试。',
      '系统繁忙，请稍后再试。',
      '我遇到了一些问题，请稍后再问我。',
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  private maskUserId(userId: string): string {
    if (userId.length <= 8) return '***';
    return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
  }
}

export const agentService = new AgentService();
```

### 3.8 重构 Webhook 路由

**文件路径**: `src/routes/webhook.ts`

```typescript
import { Router } from 'express';
import { lineService } from '../services/line.service';
import { agentService } from '../services/agent.service';
import { WebhookEvent } from '../types';
import { logger } from '../services/logger.service';

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
    logger.info('Webhook', 'Message received', {
      userId: maskUserId(userId),
      input: userMessage.substring(0, 50),
    });

    const reply = await agentService.run(userMessage, userId);
    
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

function maskUserId(userId: string): string {
  if (userId.length <= 8) return '***';
  return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
}

export default router;
```

### 3.9 重构 Chat API

**文件路径**: `src/routes/api.ts`（修改 `/chat` 路由）

```typescript
import { agentService } from '../services/agent.service';

router.post('/chat', authenticateApiKey, async (req, res) => {
  const { userId, message } = req.body as ChatRequest;
  
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
    const reply = await agentService.run(message, userId);
    
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

### 3.10 更新环境变量

**文件路径**: `.env.example`

添加：

```bash
# Agent 配置
ALERT_API_URL=https://api.example.com/alerts
AGENT_MAX_ITERATIONS=3
AGENT_TIMEOUT=30000
```

---

## 4. 验收标准

### 4.1 功能验收

- [ ] 用户输入"我要查看告警信息"能正确调用 alert_query 工具
- [ ] 用户输入"每天9点提醒我开会"能正确调用 create_task 工具
- [ ] 用户输入"查看我的任务"能正确调用 list_tasks 工具
- [ ] 用户输入"删除任务 xxx"能正确调用 delete_task 工具
- [ ] 普通对话能正常回复，无需调用工具
- [ ] `/api/chat` 接口正常工作
- [ ] LINE Webhook 正常工作
- [ ] 会话历史正确管理

### 4.2 代码质量

- [ ] TypeScript 编译无错误
- [ ] 无 ESLint 警告
- [ ] 代码符合项目规范
- [ ] 移除旧的意图识别代码

---

## 5. 测试验证

### 5.1 单元测试

```typescript
describe('AgentService', () => {
  it('should handle alert query', async () => {
    const reply = await agentService.run('我要查看告警信息', 'test-user');
    expect(reply).toBeDefined();
    expect(reply.length).toBeGreaterThan(0);
  });

  it('should handle task creation', async () => {
    const reply = await agentService.run('每天9点提醒我开会', 'test-user');
    expect(reply).toContain('任务');
  });

  it('should handle normal chat', async () => {
    const reply = await agentService.run('你好', 'test-user');
    expect(reply).toBeDefined();
  });
});
```

### 5.2 集成测试

```bash
# 测试 Chat API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "我要查看告警信息"}'
```

---

## 6. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenAI Function Calling 依赖 | 非OpenAI模型可能不支持 | 检测模型类型，提供降级方案 |
| Agent 响应延迟 | 用户体验 | 设置合理的 maxIterations |
| 工具执行失败 | 功能不可用 | 完善错误处理，友好提示 |
| 会话历史丢失 | 上下文断裂 | 保持内存存储，后续可持久化 |

---

## 7. 输出物

- [ ] `src/services/agent.service.ts` - Agent 服务
- [ ] `src/services/tools/index.ts` - 工具导出
- [ ] `src/services/tools/task.tools.ts` - 任务管理工具
- [ ] `src/services/tools/alert.tool.ts` - 告警查询工具
- [ ] `src/services/tools/device.tool.ts` - 设备状态工具
- [ ] `src/routes/webhook.ts` - 重构后的 Webhook
- [ ] `src/routes/api.ts` - 重构后的 Chat API
- [ ] `.env.example` - 更新后的环境变量

---

## 8. 后续扩展

- 支持更多工具类型
- 会话历史持久化
- 多模型支持（非 OpenAI 模型）
- 工具调用缓存
- 复杂参数提取
