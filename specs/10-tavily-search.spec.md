# Spec: Tavily 搜索工具集成

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-010 |
| 任务名称 | Tavily 搜索工具集成 |
| 优先级 | P1 (高) |
| 预计工时 | 2小时 |
| 依赖任务 | SPEC-009 (LangChain Agent 集成) |
| 负责模块 | AgentService, Tools |

---

## 1. 任务目标

为 LINE Bot Agent 添加 Tavily 搜索能力，使 Agent 能够：
- 实时搜索互联网信息
- 获取最新的新闻、数据、知识
- 回答需要实时信息的问题

## 2. 任务范围

### 2.1 包含内容

- [ ] 安装 `@langchain/community` 依赖（包含 Tavily 工具）
- [ ] 创建 Tavily 搜索工具封装
- [ ] 将工具注册到 Agent
- [ ] 更新系统提示词
- [ ] 更新环境变量配置
- [ ] 更新 `.env.example`

### 2.2 不包含内容

- Tavily API 的深度定制（使用默认配置）
- 搜索结果缓存
- 多搜索引擎支持

---

## 3. 技术方案

### 3.1 Tavily 简介

Tavily 是一个专为 AI 应用设计的搜索 API，特点：
- 返回结构化的搜索结果
- 针对大模型优化
- 支持搜索深度控制
- 返回结果包含来源 URL

### 3.2 依赖安装

```bash
npm install @langchain/community
```

### 3.3 工具实现

**文件路径**: `src/services/tools/tavily.tool.ts`

```typescript
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface TavilyToolOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export function createTavilyTool(options: TavilyToolOptions = {}): DynamicStructuredTool {
  const {
    maxResults = 5,
    searchDepth = 'basic',
    includeDomains,
    excludeDomains,
  } = options;

  const tavilyTool = new TavilySearchResults({
    maxResults,
    searchDepth,
    apiKey: process.env.TAVILY_API_KEY,
  });

  return new DynamicStructuredTool({
    name: 'web_search',
    description: `搜索互联网获取实时信息。当用户询问以下内容时使用此工具：
- 最新新闻或事件
- 实时数据（股价、天气、汇率等）
- 需要联网查询的信息
- 你不确定的知识点

不要用于：
- 简单的常识问题
- 数学计算
- 已知的静态知识`,
    schema: z.object({
      query: z.string().describe('搜索查询关键词，使用简洁明确的关键词'),
    }),
    func: async ({ query }) => {
      try {
        if (!process.env.TAVILY_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'TAVILY_API_KEY not configured',
            results: [],
          });
        }

        let searchQuery = query;
        if (includeDomains && includeDomains.length > 0) {
          searchQuery = query;
        }

        const results = await tavilyTool.invoke(searchQuery);

        let parsedResults;
        try {
          parsedResults = typeof results === 'string' ? JSON.parse(results) : results;
        } catch {
          parsedResults = [{ content: results }];
        }

        const filteredResults = excludeDomains
          ? parsedResults.filter((r: any) => {
              const url = r.url || '';
              return !excludeDomains.some(domain => url.includes(domain));
            })
          : parsedResults;

        return JSON.stringify({
          success: true,
          query,
          total: filteredResults.length,
          results: filteredResults.slice(0, maxResults).map((r: any) => ({
            title: r.title || '',
            content: r.content || r.snippet || '',
            url: r.url || '',
          })),
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          results: [],
        });
      }
    },
  });
}

export const tavilyTool = createTavilyTool();
```

### 3.4 更新工具导出

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
import { tavilyTool } from './tavily.tool';

export const tools: DynamicStructuredTool[] = [
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  alertQueryTool,
  deviceStatusTool,
  tavilyTool,
];

export { setTaskContext };
```

### 3.5 更新系统提示词

**文件路径**: `src/services/agent.service.ts`

```typescript
const SYSTEM_PROMPT = `你是一个智能运维助手，可以帮助用户：

1. 管理定时任务（创建、查看、删除、启用、禁用）
2. 查询系统告警信息
3. 查询设备运行状态
4. 搜索互联网获取实时信息
5. 进行日常对话

工具使用指南：
- 用户想设置提醒或定时通知时，使用 create_task 工具
- 用户想查看任务列表时，使用 list_tasks 工具
- 用户想删除任务时，使用 delete_task 工具（需要任务ID）
- 用户想启用/禁用任务时，使用 enable_task 或 disable_task 工具
- 用户想查看告警时，使用 alert_query 工具
- 用户想查看设备状态时，使用 device_status 工具
- 用户需要搜索实时信息、最新新闻、联网查询时，使用 web_search 工具

回复规则：
- 执行工具后，将结果以清晰友好的方式呈现给用户
- 搜索结果：总结关键信息，列出信息来源
- 告警信息：显示级别emoji、设备、描述、时间
- 任务信息：显示任务名称、执行时间、下次执行时间
- 如果工具执行失败，告诉用户稍后重试
- 普通对话时，友好地回复用户`;
```

### 3.6 更新环境变量

**文件路径**: `.env.example`

```bash
# ... 现有配置 ...

# Tavily 搜索配置
TAVILY_API_KEY=tvly-your-api-key-here
TAVILY_MAX_RESULTS=5
TAVILY_SEARCH_DEPTH=basic
```

---

## 4. 验收标准

### 4.1 功能验收

- [ ] 用户输入"搜索今天的新闻"能正确调用 web_search 工具
- [ ] 用户输入"查一下 OpenAI 最新动态"能返回搜索结果
- [ ] 搜索结果能被 Agent 正确总结并呈现给用户
- [ ] 未配置 TAVILY_API_KEY 时有友好的错误提示
- [ ] TypeScript 编译无错误

### 4.2 代码质量

- [ ] 代码符合项目规范
- [ ] 无冗余代码
- [ ] 错误处理完善

---

## 5. 测试验证

### 5.1 单元测试

```typescript
describe('TavilyTool', () => {
  it('should return search results', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    const result = await tavilyTool.invoke({ query: 'test query' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBeDefined();
  });

  it('should handle missing API key', async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await tavilyTool.invoke({ query: 'test query' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('TAVILY_API_KEY');
  });
});
```

### 5.2 集成测试

```bash
# 测试 Chat API 搜索功能
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test-user", "message": "搜索一下今天的科技新闻"}'
```

---

## 6. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Tavily API 限流 | 搜索功能不可用 | 添加错误处理，友好提示 |
| API Key 泄露 | 安全风险 | 使用环境变量，不提交到代码库 |
| 搜索结果质量 | 回答不准确 | Agent 负责总结和筛选信息 |
| 响应延迟 | 用户体验 | 设置合理的超时时间 |

---

## 7. 输出物

- [ ] `src/services/tools/tavily.tool.ts` - Tavily 搜索工具
- [ ] `src/services/tools/index.ts` - 更新工具导出
- [ ] `src/services/agent.service.ts` - 更新系统提示词
- [ ] `.env.example` - 更新环境变量

---

## 8. 后续扩展

- 搜索结果缓存
- 指定域名搜索
- 搜索历史记录
- 多搜索引擎支持（Google、Bing 等）

---

## 9. 附录

### 9.1 Tavily API 获取方式

1. 访问 https://tavily.com
2. 注册账号
3. 在 Dashboard 获取 API Key
4. 免费套餐：1000 次/月

### 9.2 参考文档

- [Tavily API 文档](https://docs.tavily.com/)
- [LangChain Community Tavily](https://js.langchain.com/docs/integrations/tools/tavily_search)
