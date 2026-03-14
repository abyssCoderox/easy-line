# Spec: 动态定时任务创建功能

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-008 |
| 任务名称 | 动态定时任务创建功能开发 |
| 优先级 | P1 (高) |
| 预计工时 | 6小时 |
| 依赖任务 | SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006 |
| 负责模块 | src/services/task-manager.service.ts, src/routes/api.ts, src/routes/webhook.ts |

---

## 1. 功能概述

### 1.1 功能目标

实现用户通过对话方式动态创建定时任务的功能。用户可通过两种入口、两种输入形式创建定时任务，任务的固定功能为按设定时间规则推送当前时间信息。

### 1.2 入口方式

| 入口 | 触发方式 | 认证方式 | 响应方式 |
|------|---------|---------|---------|
| `/api/chat` 接口 | HTTP POST 请求 | API Key 认证 | HTTP JSON 响应 |
| `/webhook` | LINE 平台推送 | LINE 签名验证 | LINE 消息回复 |

### 1.3 输入形式

| 输入形式 | 示例 | 解析方式 |
|---------|------|---------|
| 指定命令形式 | `/task create --schedule "0 9 * * *" --message "早安时间"` | 命令解析器 |
| 自然语句形式 | "每天早上9点提醒我一下" | LLM 意图识别 + 时间解析 |

### 1.4 任务功能

创建的定时任务固定功能：**按设定时间规则向用户推送当前时间信息**

推送消息格式：
```
⏰ 时间提醒
当前时间：2026-03-14 09:00:00
星期五
```

---

## 2. 系统架构

### 2.1 模块关系图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           动态任务创建架构                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐         ┌──────────────┐                             │
│  │   Webhook    │         │  Chat API    │                             │
│  │  /webhook    │         │  /api/chat   │                             │
│  └──────┬───────┘         └──────┬───────┘                             │
│         │                        │                                      │
│         │                        │                                      │
│         └──────────┬─────────────┘                                      │
│                    │                                                    │
│                    ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     TaskManagerService                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │  CommandParser  │  │   IntentParser  │  │  TaskScheduler  │   │  │
│  │  │   命令解析器     │  │   意图解析器     │  │   任务调度器     │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                    │                                                    │
│         ┌──────────┼──────────┐                                         │
│         ▼          ▼          ▼                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                │
│  │LLMService│ │Scheduler │ │LineService│                                │
│  │  LLM服务  │ │ Service  │ │ LINE服务  │                                │
│  └──────────┘ └──────────┘ └──────────┘                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 处理流程概览

```
用户输入
    │
    ├── 判断输入类型 ─────────────────────────────────┐
    │                                                │
    ▼                                                ▼
指定命令形式                                    自然语句形式
    │                                                │
    ▼                                                ▼
命令解析器                                      LLM 意图识别
    │                                                │
    │                                                ▼
    │                                        识别意图: create_task
    │                                                │
    │                                                ▼
    │                                        提取时间表达式
    │                                                │
    └────────────────────┬───────────────────────────┘
                         │
                         ▼
                  验证 Cron 表达式
                         │
                    ┌────┴────┐
                    │         │
                    ▼         ▼
                  有效       无效
                    │         │
                    │         ▼
                    │    返回错误提示
                    │    (建议正确格式)
                    │
                    ▼
              创建定时任务
                    │
                    ▼
              存储任务配置
                    │
                    ▼
              返回成功响应
```

---

## 3. 数据结构定义

### 3.1 用户任务配置 (UserTaskConfig)

```typescript
interface UserTaskConfig {
  taskId: string;           // 任务唯一标识 (UUID)
  userId: string;           // 创建者用户ID
  taskName: string;         // 任务名称
  schedule: string;         // Cron 表达式
  enabled: boolean;         // 是否启用
  createdAt: Date;          // 创建时间
  updatedAt: Date;          // 更新时间
  messageTemplate: string;  // 消息模板 (固定为时间推送)
  lastExecuteTime?: Date;   // 最后执行时间
  nextExecuteTime?: Date;   // 下次执行时间
  executeCount: number;     // 已执行次数
  maxExecuteCount?: number; // 最大执行次数 (可选)
}
```

### 3.2 任务创建请求 (TaskCreateRequest)

```typescript
interface TaskCreateRequest {
  userId: string;           // 用户ID
  input: string;            // 用户输入 (命令或自然语言)
  inputType: 'command' | 'natural';  // 输入类型 (可选，自动检测)
}
```

### 3.3 任务创建响应 (TaskCreateResponse)

```typescript
interface TaskCreateResponse {
  success: boolean;
  taskId?: string;
  taskName?: string;
  schedule?: string;
  scheduleDescription?: string;  // 人类可读的时间描述
  nextExecuteTime?: Date;
  message?: string;              // 错误或提示信息
}
```

### 3.4 意图识别结果 (IntentResult)

```typescript
interface IntentResult {
  intent: 'create_task' | 'list_tasks' | 'delete_task' | 'update_task' | 'unknown' | 'chat';
  confidence: number;            // 置信度 0-1
  entities?: {
    schedule?: string;           // Cron 表达式
    scheduleDescription?: string; // 时间描述
    taskId?: string;             // 任务ID (用于删除/更新)
    taskName?: string;           // 任务名称
  };
}
```

### 3.5 命令解析结果 (CommandParseResult)

```typescript
interface CommandParseResult {
  command: 'create' | 'list' | 'delete' | 'update' | 'help';
  params: {
    schedule?: string;
    taskName?: string;
    taskId?: string;
    enabled?: boolean;
  };
  error?: string;
}
```

---

## 4. 接口定义

### 4.1 Chat API 扩展

#### POST /api/chat

现有的 `/api/chat` 接口将扩展以支持任务创建功能。

**请求体：**
```json
{
  "userId": "U1234567890abcdef",
  "message": "每天早上9点提醒我"
}
```

**响应体 (任务创建成功)：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "U1234567890abcdef",
    "reply": "已为您创建定时任务！\n任务名称：时间提醒\n执行时间：每天 09:00\n下次执行：2026-03-15 09:00:00",
    "timestamp": "2026-03-14T10:30:00.000Z",
    "taskInfo": {
      "taskId": "task-uuid-xxx",
      "taskName": "时间提醒",
      "schedule": "0 9 * * *",
      "nextExecuteTime": "2026-03-15T09:00:00.000Z"
    }
  }
}
```

### 4.2 Webhook 处理扩展

Webhook 处理逻辑将扩展以支持任务创建意图识别。

**用户消息示例：**
```
用户: /task create --schedule "0 9 * * *" --name "早间提醒"
用户: 每天早上9点提醒我
用户: /task list
用户: /task delete task-uuid-xxx
```

### 4.3 任务管理 API (新增)

#### GET /api/tasks/user/:userId

获取用户的所有任务列表。

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tasks": [
      {
        "taskId": "task-uuid-xxx",
        "taskName": "时间提醒",
        "schedule": "0 9 * * *",
        "enabled": true,
        "createdAt": "2026-03-14T10:30:00.000Z",
        "nextExecuteTime": "2026-03-15T09:00:00.000Z",
        "executeCount": 0
      }
    ],
    "total": 1
  }
}
```

#### DELETE /api/tasks/:taskId

删除指定任务。

**请求头：**
| Header | 必填 | 说明 |
|--------|------|------|
| X-API-Key | 是 | API 密钥 |
| X-User-Id | 是 | 用户ID (验证任务所有权) |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task-uuid-xxx",
    "deleted": true
  }
}
```

#### PATCH /api/tasks/:taskId

更新任务状态。

**请求体：**
```json
{
  "enabled": false
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": "task-uuid-xxx",
    "enabled": false
  }
}
```

---

## 5. 命令格式规范

### 5.1 支持的命令

| 命令 | 格式 | 说明 |
|------|------|------|
| 创建任务 | `/task create --schedule <cron> [--name <名称>]` | 创建定时任务 |
| 列出任务 | `/task list` | 列出用户所有任务 |
| 删除任务 | `/task delete <taskId>` | 删除指定任务 |
| 启用任务 | `/task enable <taskId>` | 启用任务 |
| 禁用任务 | `/task disable <taskId>` | 禁用任务 |
| 帮助 | `/task help` | 显示帮助信息 |

### 5.2 命令解析规则

```typescript
const COMMAND_PATTERNS = {
  create: /^\/task\s+create\s+--schedule\s+["']([^"']+)["'](?:\s+--name\s+["']([^"']+)["'])?$/i,
  list: /^\/task\s+list$/i,
  delete: /^\/task\s+delete\s+(\S+)$/i,
  enable: /^\/task\s+enable\s+(\S+)$/i,
  disable: /^\/task\s+disable\s+(\S+)$/i,
  help: /^\/task\s+help$/i,
};
```

### 5.3 命令示例

```bash
# 创建任务
/task create --schedule "0 9 * * *"
/task create --schedule "*/30 * * * *" --name "半小时提醒"

# 列出任务
/task list

# 删除任务
/task delete task-uuid-xxx

# 启用/禁用任务
/task enable task-uuid-xxx
/task disable task-uuid-xxx

# 帮助
/task help
```

---

## 6. 自然语言处理

### 6.1 支持的时间表达式

| 自然语言 | Cron 表达式 | 说明 |
|---------|------------|------|
| 每天早上9点 | `0 9 * * *` | 每天 09:00 |
| 每天晚上8点 | `0 20 * * *` | 每天 20:00 |
| 每小时 | `0 * * * *` | 每小时整点 |
| 每30分钟 | `*/30 * * * *` | 每30分钟 |
| 每周一早上9点 | `0 9 * * 1` | 每周一 09:00 |
| 每月1号 | `0 0 1 * *` | 每月1号 00:00 |
| 工作日早上9点 | `0 9 * * 1-5` | 周一到周五 09:00 |

### 6.2 LLM Prompt 模板

```typescript
const INTENT_PROMPT = `你是一个任务管理助手。分析用户的输入，识别用户意图并提取相关信息。

用户输入："{userInput}"

请以JSON格式返回分析结果：
{
  "intent": "create_task|list_tasks|delete_task|chat",
  "confidence": 0.0-1.0,
  "entities": {
    "schedule": "cron表达式",
    "scheduleDescription": "人类可读的时间描述",
    "taskName": "任务名称"
  }
}

时间转换规则：
- "每天X点" -> "0 X * * *"
- "每小时" -> "0 * * * *"
- "每X分钟" -> "*/X * * * *"
- "每周X" -> "0 0 * * X" (1=周一, 7=周日)
- "工作日X点" -> "0 X * * 1-5"

只返回JSON，不要有其他内容。`;
```

### 6.3 意图识别流程

```
用户输入
    │
    ├── 检测是否为命令格式 (/task ...)
    │       │
    │       ├── 是 ──► 命令解析器处理
    │       │
    │       └── 否 ──► 继续
    │
    ▼
LLM 意图识别
    │
    ├── intent = "create_task"
    │       │
    │       └── 提取 schedule, taskName
    │
    ├── intent = "list_tasks"
    │       │
    │       └── 返回任务列表
    │
    ├── intent = "delete_task"
    │       │
    │       └── 需要进一步确认任务ID
    │
    └── intent = "chat"
            │
            └── 正常对话处理
```

---

## 7. 业务流程

### 7.1 任务创建流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        任务创建详细流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 接收用户输入                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  2. 检测输入类型                                                        │
│       │                                                                 │
│       ├── 命令格式 (/task ...) ──► 命令解析器                          │
│       │       │                                                         │
│       │       └── 解析命令和参数                                        │
│       │                                                                 │
│       └── 自然语言 ──► LLM 意图识别                                    │
│               │                                                         │
│               └── 提取意图和时间参数                                    │
│       │                                                                 │
│       ▼                                                                 │
│  3. 验证 Cron 表达式                                                    │
│       │                                                                 │
│       ├── 无效 ──► 返回错误 + 格式建议                                 │
│       │                                                                 │
│       ▼                                                                 │
│  4. 检查用户任务数量限制                                                │
│       │                                                                 │
│       ├── 超限 ──► 返回限制提示                                        │
│       │                                                                 │
│       ▼                                                                 │
│  5. 生成任务ID (UUID)                                                   │
│       │                                                                 │
│       ▼                                                                 │
│  6. 创建任务配置                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  7. 注册定时任务到 SchedulerService                                     │
│       │                                                                 │
│       ▼                                                                 │
│  8. 存储任务配置 (内存)                                                 │
│       │                                                                 │
│       ▼                                                                 │
│  9. 计算下次执行时间                                                    │
│       │                                                                 │
│       ▼                                                                 │
│  10. 返回成功响应                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 任务执行流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        任务执行流程                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. Cron 触发任务                                                       │
│       │                                                                 │
│       ▼                                                                 │
│  2. 获取任务配置                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  3. 检查任务状态 (enabled)                                              │
│       │                                                                 │
│       ├── 禁用 ──► 跳过执行                                            │
│       │                                                                 │
│       ▼                                                                 │
│  4. 生成时间消息                                                        │
│       │                                                                 │
│       │   消息格式:                                                     │
│       │   ⏰ 时间提醒                                                   │
│       │   当前时间：YYYY-MM-DD HH:mm:ss                                │
│       │   星期X                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  5. 推送消息给用户                                                      │
│       │                                                                 │
│       ├── Chat API 创建的任务 ──► 记录日志                             │
│       │                                                                 │
│       └── Webhook 创建的任务 ──► LINE pushMessage                      │
│       │                                                                 │
│       ▼                                                                 │
│  6. 更新执行计数                                                        │
│       │                                                                 │
│       ▼                                                                 │
│  7. 检查最大执行次数                                                    │
│       │                                                                 │
│       ├── 达到上限 ──► 禁用任务                                        │
│       │                                                                 │
│       ▼                                                                 │
│  8. 更新最后执行时间                                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 任务删除流程

```
用户请求删除任务
       │
       ▼
验证用户身份 (任务所有权)
       │
       ├── 无权限 ──► 返回 403 错误
       │
       ▼
停止定时任务
       │
       ▼
从存储中移除任务配置
       │
       ▼
返回删除成功响应
```

---

## 8. 错误处理

### 8.1 错误码定义

| 错误码 | HTTP状态码 | 说明 | 示例消息 |
|--------|-----------|------|---------|
| 0 | 200 | 成功 | success |
| 400 | 400 | 请求参数错误 | Invalid schedule format |
| 401 | 401 | 认证失败 | Invalid API key |
| 403 | 403 | 权限不足 | You can only delete your own tasks |
| 404 | 404 | 资源不存在 | Task not found |
| 409 | 409 | 资源冲突 | Task limit reached (max: 10) |
| 422 | 422 | 无法处理的实体 | Unable to parse time expression |
| 500 | 500 | 服务器内部错误 | Internal server error |

### 8.2 错误响应格式

```typescript
interface ErrorResponse {
  code: number;
  message: string;
  details?: {
    field?: string;
    suggestion?: string;
  };
}
```

### 8.3 错误处理示例

#### 无效的 Cron 表达式

```json
{
  "code": 400,
  "message": "Invalid schedule format",
  "details": {
    "field": "schedule",
    "suggestion": "Try: '0 9 * * *' for daily at 9:00 AM"
  }
}
```

#### 任务数量超限

```json
{
  "code": 409,
  "message": "Task limit reached",
  "details": {
    "field": "tasks",
    "suggestion": "Maximum 10 tasks per user. Delete some tasks first."
  }
}
```

#### 无法解析时间表达式

```json
{
  "code": 422,
  "message": "Unable to parse time expression",
  "details": {
    "field": "input",
    "suggestion": "Try using command format: /task create --schedule \"0 9 * * *\""
  }
}
```

### 8.4 错误处理策略

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| Cron 格式错误 | 返回错误 + 格式建议 | 提供正确格式示例 |
| LLM 解析失败 | 降级为普通对话 | "我不太理解，请用命令格式试试" |
| 任务不存在 | 返回 404 | "任务不存在或已被删除" |
| 权限不足 | 返回 403 | "您只能操作自己的任务" |
| 任务超限 | 返回 409 | "任务数量已达上限，请先删除部分任务" |

---

## 9. 安全考量

### 9.1 认证与授权

| 安全措施 | 说明 |
|---------|------|
| API Key 认证 | Chat API 需要 X-API-Key 头 |
| LINE 签名验证 | Webhook 需要验证 LINE 签名 |
| 用户隔离 | 用户只能查看/操作自己的任务 |
| 任务所有权验证 | 删除/更新时验证 userId |

### 9.2 输入验证

| 验证项 | 规则 | 说明 |
|--------|------|------|
| Cron 表达式 | 必须是有效的 5 位 cron | 防止注入攻击 |
| 任务名称 | 最大 50 字符 | 防止过长输入 |
| 用户ID | 最大 100 字符 | 格式验证 |
| 输入长度 | 最大 1000 字符 | 防止超大输入 |

### 9.3 资源限制

| 限制项 | 限制值 | 说明 |
|--------|--------|------|
| 每用户最大任务数 | 10 | 防止资源滥用 |
| 任务执行频率 | 最小间隔 1 分钟 | 防止过于频繁 |
| 任务最大执行次数 | 可选设置 | 防止无限执行 |
| 消息推送频率 | 遵守 LINE API 限制 | 避免被限流 |

### 9.4 敏感信息处理

```typescript
// 不要在日志中记录完整的用户输入
logger.info('TaskManager', 'Task created', {
  taskId,
  userId: maskUserId(userId),  // 遮蔽部分信息
  schedule,
});
```

---

## 10. 实现清单

### 10.1 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/services/task-manager.service.ts` | 任务管理服务 |
| `src/utils/cron-utils.ts` | Cron 工具函数 |
| `src/utils/command-parser.ts` | 命令解析器 |

### 10.2 修改文件

| 文件路径 | 变更说明 |
|---------|---------|
| `src/routes/api.ts` | 添加任务管理 API 端点 |
| `src/routes/webhook.ts` | 扩展消息处理逻辑 |
| `src/services/llm.service.ts` | 添加意图识别方法 |
| `src/types/index.ts` | 添加新类型定义 |
| `src/config/index.ts` | 添加任务限制配置 |

### 10.3 TaskManagerService 类设计

```typescript
export class TaskManagerService {
  private userTasks: Map<string, UserTaskConfig[]> = new Map();
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  
  // 任务创建
  async createTask(userId: string, request: TaskCreateRequest): Promise<TaskCreateResponse>;
  
  // 命令解析
  parseCommand(input: string): CommandParseResult;
  
  // 自然语言处理
  async parseNaturalLanguage(userId: string, input: string): Promise<IntentResult>;
  
  // 任务列表
  listTasks(userId: string): UserTaskConfig[];
  
  // 任务删除
  deleteTask(userId: string, taskId: string): boolean;
  
  // 任务状态更新
  updateTaskStatus(userId: string, taskId: string, enabled: boolean): boolean;
  
  // 执行任务
  private executeTask(taskId: string): Promise<void>;
  
  // 生成时间消息
  private generateTimeMessage(): string;
  
  // 验证 Cron 表达式
  private validateSchedule(schedule: string): boolean;
  
  // 计算下次执行时间
  private calculateNextExecuteTime(schedule: string): Date;
  
  // 获取用户任务数量
  getUserTaskCount(userId: string): number;
}
```

### 10.4 类型定义扩展

```typescript
// src/types/index.ts 新增

export interface UserTaskConfig {
  taskId: string;
  userId: string;
  taskName: string;
  schedule: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  messageTemplate: string;
  lastExecuteTime?: Date;
  nextExecuteTime?: Date;
  executeCount: number;
  maxExecuteCount?: number;
}

export interface TaskCreateRequest {
  userId: string;
  input: string;
  inputType?: 'command' | 'natural';
}

export interface TaskCreateResponse {
  success: boolean;
  taskId?: string;
  taskName?: string;
  schedule?: string;
  scheduleDescription?: string;
  nextExecuteTime?: Date;
  message?: string;
}

export interface IntentResult {
  intent: 'create_task' | 'list_tasks' | 'delete_task' | 'update_task' | 'unknown' | 'chat';
  confidence: number;
  entities?: {
    schedule?: string;
    scheduleDescription?: string;
    taskId?: string;
    taskName?: string;
  };
}

export interface CommandParseResult {
  command: 'create' | 'list' | 'delete' | 'update' | 'help' | null;
  params: {
    schedule?: string;
    taskName?: string;
    taskId?: string;
    enabled?: boolean;
  };
  error?: string;
}

export interface TaskLimitConfig {
  maxTasksPerUser: number;
  minScheduleInterval: number;
  defaultMaxExecuteCount?: number;
}
```

---

## 11. 测试验证

### 11.1 单元测试

```typescript
describe('TaskManagerService', () => {
  describe('parseCommand', () => {
    it('should parse create command with schedule', () => {
      const result = service.parseCommand('/task create --schedule "0 9 * * *"');
      expect(result.command).toBe('create');
      expect(result.params.schedule).toBe('0 9 * * *');
    });
    
    it('should parse create command with name', () => {
      const result = service.parseCommand('/task create --schedule "0 9 * * *" --name "早间提醒"');
      expect(result.command).toBe('create');
      expect(result.params.taskName).toBe('早间提醒');
    });
    
    it('should parse list command', () => {
      const result = service.parseCommand('/task list');
      expect(result.command).toBe('list');
    });
    
    it('should parse delete command', () => {
      const result = service.parseCommand('/task delete task-123');
      expect(result.command).toBe('delete');
      expect(result.params.taskId).toBe('task-123');
    });
    
    it('should return null for non-command input', () => {
      const result = service.parseCommand('每天早上9点提醒我');
      expect(result.command).toBeNull();
    });
  });
  
  describe('validateSchedule', () => {
    it('should validate correct cron expression', () => {
      expect(service.validateSchedule('0 9 * * *')).toBe(true);
      expect(service.validateSchedule('*/30 * * * *')).toBe(true);
    });
    
    it('should reject invalid cron expression', () => {
      expect(service.validateSchedule('invalid')).toBe(false);
      expect(service.validateSchedule('0 9 * *')).toBe(false);
    });
  });
  
  describe('createTask', () => {
    it('should create task with valid schedule', async () => {
      const response = await service.createTask('user-1', {
        userId: 'user-1',
        input: '/task create --schedule "0 9 * * *"',
      });
      
      expect(response.success).toBe(true);
      expect(response.taskId).toBeDefined();
      expect(response.schedule).toBe('0 9 * * *');
    });
    
    it('should reject task when limit reached', async () => {
      // 创建 10 个任务
      for (let i = 0; i < 10; i++) {
        await service.createTask('user-1', {
          userId: 'user-1',
          input: `/task create --schedule "${i} 9 * * *"`,
        });
      }
      
      // 第 11 个应该失败
      const response = await service.createTask('user-1', {
        userId: 'user-1',
        input: '/task create --schedule "0 10 * * *"',
      });
      
      expect(response.success).toBe(false);
      expect(response.message).toContain('limit');
    });
  });
  
  describe('deleteTask', () => {
    it('should delete own task', async () => {
      const created = await service.createTask('user-1', {
        userId: 'user-1',
        input: '/task create --schedule "0 9 * * *"',
      });
      
      const result = service.deleteTask('user-1', created.taskId!);
      expect(result).toBe(true);
    });
    
    it('should not delete other user task', async () => {
      const created = await service.createTask('user-1', {
        userId: 'user-1',
        input: '/task create --schedule "0 9 * * *"',
      });
      
      const result = service.deleteTask('user-2', created.taskId!);
      expect(result).toBe(false);
    });
  });
  
  describe('generateTimeMessage', () => {
    it('should generate formatted time message', () => {
      const message = service.generateTimeMessage();
      expect(message).toContain('时间提醒');
      expect(message).toContain('当前时间');
    });
  });
});
```

### 11.2 集成测试

```bash
# 启动服务
npm run dev

# 测试命令格式创建任务
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "/task create --schedule \"0 9 * * *\" --name \"早间提醒\""}'

# 预期响应
{
  "code": 0,
  "message": "success",
  "data": {
    "userId": "test-user",
    "reply": "已为您创建定时任务！\n任务名称：早间提醒\n执行时间：每天 09:00\n下次执行：...",
    "timestamp": "...",
    "taskInfo": {
      "taskId": "...",
      "taskName": "早间提醒",
      "schedule": "0 9 * * *",
      "nextExecuteTime": "..."
    }
  }
}

# 测试自然语言创建任务
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "每天早上9点提醒我"}'

# 测试列出任务
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "/task list"}'

# 测试删除任务
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "/task delete task-uuid-xxx"}'

# 测试任务管理 API
curl http://localhost:3000/api/tasks/user/test-user \
  -H "X-API-Key: your-api-key"
```

### 11.3 Webhook 测试

```bash
# 通过 LINE 客户端发送消息测试
# 1. 发送: /task create --schedule "0 9 * * *"
# 2. 验证收到创建成功回复
# 3. 等待定时任务触发
# 4. 验证收到时间推送消息
```

---

## 12. 验收标准

### 12.1 功能验收

- [ ] 命令格式正确解析
- [ ] 自然语言意图正确识别
- [ ] Cron 表达式正确验证
- [ ] 任务创建成功并返回正确信息
- [ ] 任务按计划执行
- [ ] 时间消息正确生成和推送
- [ ] 任务列表正确返回
- [ ] 任务删除功能正常
- [ ] 任务启用/禁用功能正常
- [ ] 用户隔离正确实现

### 12.2 接口验收

- [ ] POST /api/chat 支持任务创建
- [ ] Webhook 支持任务创建
- [ ] GET /api/tasks/user/:userId 正常工作
- [ ] DELETE /api/tasks/:taskId 正常工作
- [ ] PATCH /api/tasks/:taskId 正常工作

### 12.3 安全验收

- [ ] API Key 认证正常
- [ ] LINE 签名验证正常
- [ ] 用户只能操作自己的任务
- [ ] 任务数量限制生效
- [ ] 输入验证覆盖所有场景

### 12.4 错误处理验收

- [ ] 无效 Cron 表达式返回正确错误
- [ ] 任务超限返回正确错误
- [ ] 任务不存在返回 404
- [ ] 权限不足返回 403
- [ ] LLM 解析失败有降级处理

---

## 13. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM 解析不准确 | 任务创建失败 | 提供命令格式备选方案 |
| 服务重启任务丢失 | 推送中断 | 考虑持久化存储 (后续版本) |
| 用户创建过多任务 | 资源耗尽 | 设置每用户任务上限 |
| Cron 表达式注入 | 安全风险 | 严格验证格式 |
| 时区问题 | 推送时间错误 | 明确使用服务器时区 |

---

## 14. 后续优化方向

| 优化项 | 说明 | 优先级 |
|--------|------|--------|
| 任务持久化 | 使用数据库存储任务配置 | P1 |
| 时区支持 | 支持用户指定时区 | P2 |
| 任务模板 | 预设常用任务模板 | P2 |
| 任务历史 | 记录任务执行历史 | P2 |
| Web 管理界面 | 提供可视化管理界面 | P3 |

---

## 15. 输出物

- [ ] src/services/task-manager.service.ts
- [ ] src/utils/cron-utils.ts
- [ ] src/utils/command-parser.ts
- [ ] 更新 src/routes/api.ts
- [ ] 更新 src/routes/webhook.ts
- [ ] 更新 src/services/llm.service.ts
- [ ] 更新 src/types/index.ts
- [ ] 更新 src/config/index.ts
- [ ] 单元测试文件

---

## 16. 审批

| 角色 | 姓名 | 日期 | 状态 |
|------|------|------|------|
| 开发者 | | | 待审批 |
| 审核者 | | | 待审批 |

---

**请审核此规范文档，确认后我将开始实施。**
