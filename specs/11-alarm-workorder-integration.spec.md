# SPEC-011: 告警分析与工单创建集成

## 1. 概述

### 1.1 目标

将现有告警分析与工单创建能力以 LangChain Tools 的方式集成到 LINE Bot Agent 系统中，实现完整的告警处理闭环：

```
获取告警列表 → 告警分析 → 人机确认 → 创建工单 → 返回结果
```

### 1.2 业务价值

- 运维人员可通过 LINE Bot 快速查看告警
- AI 自动分析告警，提供决策建议
- 一键创建工单，提高运维效率
- 完整的对话式交互体验

### 1.3 优先级

| 优先级 | 说明 |
|--------|------|
| P0 | 核心流程：告警列表、告警分析、工单创建 |
| P1 | 增强功能：会话管理、错误处理 |
| P2 | 优化功能：缓存、性能优化 |

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LINE Bot Agent                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   LINE      │    │   Agent     │    │    LLM      │             │
│  │   Service   │◄──►│   Service   │◄──►│   Service   │             │
│  └─────────────┘    └──────┬──────┘    └─────────────┘             │
│                            │                                        │
│                            ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      Tool Layer                              │   │
│  ├─────────────┬─────────────┬─────────────┬─────────────────┤   │
│  │create_alarm │ list_alarms │analyze_alarm│create_work_order│   │
│  │  _session   │             │             │                 │   │
│  └──────┬──────┴──────┬──────┴──────┬──────┴────────┬────────┘   │
│         │             │             │               │             │
└─────────┼─────────────┼─────────────┼───────────────┼─────────────┘
          │             │             │               │
          ▼             ▼             ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External Services                              │
├─────────────────────────────┬───────────────────────────────────────┤
│     FastAPI Backend         │         Dify Workflow API            │
│  ┌─────────────────────┐   │   ┌─────────────────────────────┐    │
│  │ POST /new_session   │   │   │ POST /v1/workflows/run      │    │
│  │ GET  /alarms        │   │   │                             │    │
│  │ POST /process_alarms│   │   │   工单创建工作流             │    │
│  └─────────────────────┘   │   └─────────────────────────────┘    │
└─────────────────────────────┴───────────────────────────────────────┘
```

### 2.2 模块划分

| 模块 | 职责 | 文件位置 |
|------|------|---------|
| AlarmTool | 告警相关工具封装 | `src/services/tools/alarm.tool.ts` |
| WorkOrderTool | 工单创建工具封装 | `src/services/tools/workorder.tool.ts` |
| AlarmSessionService | 告警会话状态管理 | `src/services/alarm-session.service.ts` |
| SSEClient | SSE 流式响应处理 | `src/utils/sse-client.ts` |
| FlexMessageBuilder | LINE Flex Message 构建 | `src/utils/flex-message-builder.ts` |

---

## 3. 功能模块详细设计

### 3.1 Tool 1: create_alarm_session

#### 3.1.1 功能描述

创建告警分析会话，为后续 `analyze_alarm` 提供 `session_id`。

#### 3.1.2 接口定义

**Tool Schema:**

```typescript
{
  name: 'create_alarm_session',
  description: '创建告警分析会话。在分析告警前必须先调用此工具获取会话ID。',
  schema: z.object({})  // 无参数
}
```

**后端接口:**

| 项目 | 值 |
|------|-----|
| Method | POST |
| URL | `{ALARM_API_BASE_URL}/api/v1/new_session` |
| Content-Type | application/json |

**请求体:**

```json
{}
```

**响应体:**

```json
{
  "session_id": "uuid-string"
}
```

#### 3.1.3 数据模型

```typescript
interface AlarmSessionResponse {
  session_id: string;
}

interface AlarmSessionContext {
  sessionId: string;
  createdAt: Date;
  userId: string;
  selectedAlarm: AlarmInfo | null;
  analysisResult: AlarmAnalysisResult | null;
  pendingConfirmation: 'create_work_order' | null;
}
```

---

### 3.2 Tool 2: list_alarms

#### 3.2.1 功能描述

获取当前告警列表，为 Agent 提供候选告警集。

#### 3.2.2 接口定义

**Tool Schema:**

```typescript
{
  name: 'list_alarms',
  description: '获取告警列表。当用户要求查看告警、查看报警、未处理告警时使用此工具。',
  schema: z.object({
    status: z.enum(['', 'Untreated', 'Processing', 'Processed'])
      .optional()
      .describe('处理状态筛选：空字符串表示全部，Untreated(未处理)，Processing(处理中)，Processed(已处理)'),
    page: z.number().min(1).optional()
      .describe('页码，默认1'),
    page_size: z.number().min(1).max(100).optional()
      .describe('每页条数，默认20'),
  })
}
```

**后端接口:**

| 项目 | 值 |
|------|-----|
| Method | GET |
| URL | `{ALARM_API_BASE_URL}/api/v1/alarms` |
| Query Params | status, page, page_size |

**响应体:**

```json
{
  "data": {
    "alarms": [
      {
        "id": "alarm-001",
        "device_sn": "SN123456",
        "site_name": "北京站点",
        "alarm_code": "E001",
        "processing_status": "Untreated",
        "created_at": "2024-01-15T10:30:00Z",
        "raw_data": "{...}"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

#### 3.2.3 数据模型

```typescript
interface AlarmInfo {
  id: string;
  device_sn: string;
  deviceName?: string;
  site_name: string;
  siteName?: string;
  alarm_code: string;
  alarmType?: string;
  alarmTypeName?: string;
  alarmTime?: string;
  processing_status: 'Untreated' | 'Processing' | 'Processed';
  currentStatus?: string;
  created_at: string;
  raw_data?: string;
}

interface ListAlarmsResponse {
  data: {
    alarms: AlarmInfo[];
    total: number;
    page: number;
    page_size: number;
  };
}

interface ListAlarmsToolResult {
  success: boolean;
  total: number;
  page: number;
  alarms: AlarmInfo[];
  error?: string;
}
```

---

### 3.3 Tool 3: analyze_alarm

#### 3.3.1 功能描述

对指定告警执行流式分析，输出结构化分析结论并转换为 LINE Flex Message。

#### 3.3.2 接口定义

**Tool Schema:**

```typescript
{
  name: 'analyze_alarm',
  description: '分析指定告警。当用户要求分析告警、研判告警、诊断告警时使用。需要先调用create_alarm_session获取会话ID。',
  schema: z.object({
    session_id: z.string()
      .describe('告警分析会话ID，由create_alarm_session返回'),
    alarm_id: z.string()
      .describe('要分析的告警ID'),
    language: z.enum(['zh', 'en']).optional()
      .describe('分析结果语言，默认zh'),
    force_reanalyze: z.boolean().optional()
      .describe('是否强制重新分析，默认false'),
  })
}
```

**后端接口:**

| 项目 | 值 |
|------|-----|
| Method | POST |
| URL | `{ALARM_API_BASE_URL}/api/v1/process_alarms` |
| Content-Type | application/json |
| Response Type | text/event-stream (SSE) |

**请求体:**

```json
{
  "session_id": "uuid",
  "alarm": {
    "id": 101,
    "device_sn": "INV-0001",
    "deviceName": "Inverter-1",
    "siteName": "Bangkok PV Site",
    "alarmType": "Offline",
    "alarmTypeName": "Device Offline",
    "alarmTime": "2026-03-16 09:20:00",
    "currentStatus": "InAlarm",
    "processingStatus": "Untreated"
  },
  "mode": "standard",
  "business_type": "device_alarm",
  "force_reanalyze": false,
  "language": "zh"
}
```

**SSE 响应格式:**

```
data: {"type": "content", "text": "正在从业务平台获取实时数据..."}
data: {"type": "agent_log", "log_type": "observation", "payload": {...}}
data: {"type": "agent_log", "log_type": "plan", "payload": {...}}
data: {"type": "decision_results", "payload": {...}}
```

#### 3.3.3 数据模型

```typescript
interface AnalyzeAlarmInput {
  session_id: string;
  alarm: AlarmInfo;
  mode?: 'standard' | 'quick';
  business_type?: string;
  force_reanalyze?: boolean;
  language?: 'zh' | 'en';
}

interface SSEMessage {
  type: 'content' | 'agent_log' | 'decision_results';
  text?: string;
  log_type?: 'observation' | 'plan' | 'thought' | 'summary';
  payload?: any;
}

interface DecisionResult {
  id: string;
  status: string;
  action: 'dispatch' | 'observe' | 'close' | 'ignore';
  level: string;
  tags: string[];
  confidence: number;
  reason: string;
}

interface AnalyzeAlarmToolResult {
  success: boolean;
  flexMessage?: FlexMessage;
  decisionResults?: DecisionResult[];
  rawAnalysis?: string;
  error?: string;
  errorType?: 'alarm_analysis_failed' | 'sse_parse_error' | 'timeout';
}
```

#### 3.3.4 SSE 处理流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  发起请求    │────►│  消费SSE流   │────►│  解析消息    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  构建Flex   │◄────│  提取决策    │
                    │  Message    │     │  结果       │
                    └─────────────┘     └─────────────┘
```

---

### 3.4 Tool 4: create_work_order

#### 3.4.1 功能描述

结合当前告警与分析结果，创建工单。

#### 3.4.2 接口定义

**Tool Schema:**

```typescript
{
  name: 'create_work_order',
  description: '创建工单。在告警分析完成后，用户确认派单时调用。需要tenant_id和pmms_authorization。',
  schema: z.object({
    alarm_id: z.string()
      .describe('告警ID'),
    fault_desc: z.string()
      .describe('故障描述摘要，100-400字'),
  })
}
```

**后端接口 (Dify Workflow):**

| 项目 | 值 |
|------|-----|
| Method | POST |
| URL | `{DIFY_WORKFLOW_URL}/v1/workflows/run` |
| Content-Type | application/json |
| Authorization | Bearer {DIFY_API_KEY} |

**请求体:**

```json
{
  "inputs": {
    "tenant_id": "123456",
    "device_type": "inverter",
    "device_sn": "SN123456",
    "alarm_id": "A20260311001",
    "alarm_category": "AlarmWorkOrder",
    "alarm_type": "ArcFail",
    "alarm_type_name": "Arc Fault",
    "fault_code": 1001,
    "fault_desc": "设备离线超过4小时，建议派单排查",
    "site_name": "XX PV Site",
    "pmms_authorization": "token"
  },
  "response_mode": "blocking",
  "user": "langchain-agent"
}
```

**响应体:**

```json
{
  "workflow_run_id": "xxx",
  "outputs": {
    "work_order_id": "WO20260311008",
    "work_order_no": "GD-20260311-008",
    "title": "XX站点逆变器故障处理",
    "level": "HIGH",
    "status": "created",
    "assignee": "iRunDo",
    "acceptor": "iRunDo",
    "description": "根据告警分析自动建单",
    "start_time": "2026-03-12 11:25:38",
    "end_time": "2026-03-19 11:25:38"
  }
}
```

#### 3.4.3 数据模型

```typescript
interface WorkOrderInput {
  tenant_id: string;
  pmms_authorization: string;
  alarm: {
    id: string;
    device_sn: string;
    device_type?: string;
    site_name: string;
    alarm_category?: string;
    alarm_type?: string;
    alarm_type_name?: string;
    fault_code?: number | string;
  };
  analysis_markdown: string;
  user?: string;
}

interface DifyWorkflowRequest {
  inputs: {
    tenant_id: string;
    device_type: string;
    device_sn: string;
    alarm_id: string;
    alarm_category: string;
    alarm_type: string;
    alarm_type_name: string;
    fault_code: number | string;
    fault_desc: string;
    site_name: string;
    pmms_authorization: string;
  };
  response_mode: 'blocking';
  user: string;
}

interface WorkOrderResult {
  success: boolean;
  workflow_run_id?: string;
  work_order_id?: string;
  work_order_no?: string;
  title?: string;
  level?: string;
  status?: string;
  assignee?: string;
  acceptor?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  error?: string;
  errorType?: 'missing_business_context' | 'dify_error' | 'validation_error';
}
```

---

## 4. 业务流程

### 4.1 主流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        告警处理主流程                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  用户: "查看告警"                                                    │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────┐                                                    │
│  │ list_alarms │                                                    │
│  └──────┬──────┘                                                    │
│         │                                                           │
│         ▼                                                           │
│  Agent: "当前有X条告警，列表如下..."                                  │
│       │                                                             │
│       ▼                                                             │
│  用户: "分析第2条告警"                                               │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────┐                                               │
│  │create_alarm_session│  (如果没有session)                          │
│  └────────┬─────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────┐                                                   │
│  │analyze_alarm │                                                   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  Agent: [Flex Message 展示分析结果]                                  │
│         "建议派单处理，是否创建工单？"                                │
│       │                                                             │
│       ▼                                                             │
│  用户: "是，创建工单"                                                │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────────────┐                                               │
│  │create_work_order │                                               │
│  └────────┬─────────┘                                               │
│           │                                                         │
│           ▼                                                         │
│  Agent: "工单创建成功！工单号：GD-20260311-008"                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 状态管理

```typescript
interface AlarmWorkflowState {
  sessionId: string | null;
  alarmList: AlarmInfo[];
  selectedAlarm: AlarmInfo | null;
  analysisResult: DecisionResult[] | null;
  pendingConfirmation: 'create_work_order' | null;
  businessContext: {
    tenant_id: string | null;
    pmms_authorization: string | null;
  };
}
```

### 4.3 会话上下文管理

每个用户的告警工作流状态存储在 `AlarmSessionService` 中：

```typescript
class AlarmSessionService {
  private sessions: Map<string, AlarmWorkflowState> = new Map();
  
  getSession(userId: string): AlarmWorkflowState;
  setSessionId(userId: string, sessionId: string): void;
  setAlarmList(userId: string, alarms: AlarmInfo[]): void;
  selectAlarm(userId: string, alarmId: string): AlarmInfo | null;
  setAnalysisResult(userId: string, result: DecisionResult[]): void;
  setPendingConfirmation(userId: string, type: 'create_work_order'): void;
  clearPendingConfirmation(userId: string): void;
  setBusinessContext(userId: string, tenantId: string, auth: string): void;
  clearSession(userId: string): void;
}
```

---

## 5. Agent System Prompt 设计

### 5.1 核心约束

```typescript
const ALARM_SYSTEM_PROMPT = `
你是一个智能运维助手，专门处理告警分析和工单创建任务。

## 告警处理流程规则

1. **查看告警**
   - 当用户要求"查看告警"、"未处理告警"时，调用 list_alarms
   - 返回编号化列表，引导用户选择

2. **分析告警**
   - 当用户要求"分析第X条告警"时：
     a. 如果没有会话ID，先调用 create_alarm_session
     b. 从列表中获取对应告警信息
     c. 调用 analyze_alarm 进行分析
   - 分析完成后，展示结果并询问"是否创建工单？"

3. **创建工单**
   - **必须等待用户明确确认**后才能调用 create_work_order
   - 确认话术："是否需要为该告警创建工单？"
   - 只有用户回复"是"、"创建"、"派单"等肯定词后才执行
   - 如果缺少 tenant_id 或 pmms_authorization，告知用户缺少业务上下文

## 禁止行为

- 禁止在用户未确认的情况下创建工单
- 禁止跳过分析直接创建工单
- 禁止忽略分析结果中的建议

## 错误处理

- 如果告警列表获取失败，告知用户稍后重试
- 如果分析失败，展示部分结果并说明原因
- 如果工单创建失败，保留分析结果，告知用户可手动建单
`;
```

---

## 6. 错误处理规范

### 6.1 错误类型定义

```typescript
enum AlarmErrorType {
  ALARM_LIST_FAILED = 'alarm_list_failed',
  ALARM_ANALYSIS_FAILED = 'alarm_analysis_failed',
  SSE_PARSE_ERROR = 'sse_parse_error',
  SSE_TIMEOUT = 'sse_timeout',
  MISSING_BUSINESS_CONTEXT = 'missing_business_context',
  DIFY_ERROR = 'dify_error',
  VALIDATION_ERROR = 'validation_error',
  SESSION_NOT_FOUND = 'session_not_found',
  ALARM_NOT_FOUND = 'alarm_not_found',
}
```

### 6.2 错误响应格式

```typescript
interface AlarmToolError {
  success: false;
  error_type: AlarmErrorType;
  message: string;
  details?: {
    httpStatus?: number;
    originalError?: string;
    partialData?: any;
  };
}
```

### 6.3 各场景错误处理

| 场景 | 错误类型 | 处理方式 |
|------|---------|---------|
| 告警列表接口失败 | ALARM_LIST_FAILED | 返回友好提示，建议稍后重试 |
| SSE 连接中断 | SSE_TIMEOUT | 返回部分分析结果，标记为不完整 |
| SSE 解析失败 | SSE_PARSE_ERROR | 返回原始文本，提示格式异常 |
| 缺少 tenant_id | MISSING_BUSINESS_CONTEXT | 明确告知缺少业务上下文，无法建单 |
| Dify 返回错误 | DIFY_ERROR | 保留完整错误信息，便于排查 |

---

## 7. 环境配置

### 7.1 新增环境变量

```bash
# 告警服务配置
ALARM_API_BASE_URL=http://localhost:8000
ALARM_API_TIMEOUT=30000

# Dify 工作流配置
DIFY_WORKFLOW_URL=http://192.168.100.225:8088
DIFY_API_KEY=app-xxxxxxxx

# 默认业务上下文（可选）
DEFAULT_TENANT_ID=
DEFAULT_PMMS_AUTHORIZATION=
```

### 7.2 配置验证

```typescript
function validateAlarmConfig(): void {
  const errors: string[] = [];
  
  if (!process.env.ALARM_API_BASE_URL) {
    errors.push('ALARM_API_BASE_URL is required for alarm integration');
  }
  
  if (!process.env.DIFY_WORKFLOW_URL) {
    errors.push('DIFY_WORKFLOW_URL is required for work order creation');
  }
  
  if (!process.env.DIFY_API_KEY) {
    errors.push('DIFY_API_KEY is required for work order creation');
  }
  
  if (errors.length > 0) {
    console.warn('Alarm integration config warnings:', errors);
  }
}
```

---

## 8. 开发任务分解

### 8.1 任务清单

| 任务ID | 任务名称 | 优先级 | 预估工时 | 依赖 |
|--------|---------|--------|---------|------|
| TASK-011-01 | 创建类型定义文件 | P0 | 1h | - |
| TASK-011-02 | 实现 SSE 客户端工具 | P0 | 2h | TASK-011-01 |
| TASK-011-03 | 实现告警会话服务 | P0 | 2h | TASK-011-01 |
| TASK-011-04 | 实现 create_alarm_session Tool | P0 | 1h | TASK-011-03 |
| TASK-011-05 | 实现 list_alarms Tool | P0 | 2h | TASK-011-01 |
| TASK-011-06 | 实现 analyze_alarm Tool | P0 | 4h | TASK-011-02, TASK-011-03 |
| TASK-011-07 | 实现 Flex Message 构建器 | P0 | 3h | TASK-011-01 |
| TASK-011-08 | 实现 create_work_order Tool | P0 | 3h | TASK-011-01 |
| TASK-011-09 | 更新 Agent System Prompt | P0 | 1h | TASK-011-04~08 |
| TASK-011-10 | 集成测试 | P1 | 2h | TASK-011-09 |
| TASK-011-11 | 错误处理完善 | P1 | 2h | TASK-011-10 |

### 8.2 文件结构

```
src/
├── services/
│   ├── tools/
│   │   ├── alarm.tool.ts          # 修改：新增告警相关工具
│   │   ├── workorder.tool.ts      # 新增：工单创建工具
│   │   └── index.ts               # 修改：导出新工具
│   ├── alarm-session.service.ts   # 新增：告警会话管理
│   └── agent.service.ts           # 修改：更新 System Prompt
├── utils/
│   ├── sse-client.ts              # 新增：SSE 客户端
│   └── flex-message-builder.ts    # 新增：Flex Message 构建
├── types/
│   ├── index.ts                   # 修改：新增类型定义
│   └── alarm.types.ts             # 新增：告警相关类型
└── config/
    └── index.ts                   # 修改：新增配置项
```

---

## 9. 测试方案

### 9.1 单元测试

```typescript
describe('Alarm Tools', () => {
  describe('create_alarm_session', () => {
    it('should return session_id on success', async () => {
      // ...
    });
    
    it('should handle API error', async () => {
      // ...
    });
  });
  
  describe('list_alarms', () => {
    it('should return alarm list', async () => {
      // ...
    });
    
    it('should filter by status', async () => {
      // ...
    });
  });
  
  describe('analyze_alarm', () => {
    it('should parse SSE stream correctly', async () => {
      // ...
    });
    
    it('should generate Flex Message', async () => {
      // ...
    });
    
    it('should handle SSE timeout', async () => {
      // ...
    });
  });
  
  describe('create_work_order', () => {
    it('should create work order with valid input', async () => {
      // ...
    });
    
    it('should reject when missing business context', async () => {
      // ...
    });
  });
});
```

### 9.2 集成测试场景

| 场景 | 输入 | 预期输出 |
|------|------|---------|
| 查看告警 | "查看告警" | 返回告警列表 |
| 分析告警 | "分析第1条告警" | 返回分析结果 Flex Message |
| 确认派单 | "是，创建工单" | 返回工单创建结果 |
| 取消派单 | "不用了" | 确认取消，不创建工单 |
| 缺少上下文 | 无 tenant_id 时创建工单 | 提示缺少业务上下文 |

---

## 10. 验收标准

### 10.1 功能验收

- [ ] 用户可通过对话查看告警列表
- [ ] 用户可选择告警进行分析
- [ ] 分析结果以 Flex Message 形式展示
- [ ] Agent 会询问是否创建工单
- [ ] 用户确认后可成功创建工单
- [ ] 工单创建结果清晰展示

### 10.2 非功能验收

- [ ] SSE 流式响应处理稳定，超时有兜底
- [ ] 错误信息友好，不暴露技术细节
- [ ] 会话状态管理正确，无内存泄漏
- [ ] 响应时间符合预期（告警列表 < 3s，分析 < 30s，工单 < 10s）

---

## 11. 附录

### 11.1 LINE Flex Message 示例

```json
{
  "type": "flex",
  "altText": "设备 INV-0001 告警研判结果：建议派单",
  "contents": {
    "type": "bubble",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "告警研判结果",
          "weight": "bold",
          "size": "lg"
        }
      ]
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "设备：INV-0001",
          "wrap": true
        },
        {
          "type": "text",
          "text": "电站：Bangkok PV Site",
          "wrap": true
        },
        {
          "type": "separator"
        },
        {
          "type": "text",
          "text": "建议动作：派单处理",
          "weight": "bold",
          "color": "#FF6B6B"
        },
        {
          "type": "text",
          "text": "告警等级：C_Secondary",
          "wrap": true
        },
        {
          "type": "text",
          "text": "置信度：85%",
          "wrap": true
        },
        {
          "type": "text",
          "text": "研判理由：设备离线超过4小时，建议派单排查通信链路",
          "wrap": true
        }
      ]
    }
  }
}
```

### 11.2 参考文档

- [LINE Flex Message 文档](https://developers.line.biz/en/docs/messaging-api/flex-messages/)
- [Server-Sent Events 规范](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [LangChain Tools 文档](https://js.langchain.com/docs/modules/agents/tools/)
