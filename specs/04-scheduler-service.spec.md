# Spec: 定时任务服务模块

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-004 |
| 任务名称 | 定时任务服务模块开发 |
| 优先级 | P1 (高) |
| 预计工时 | 4小时 |
| 依赖任务 | SPEC-001, SPEC-002 |
| 负责模块 | src/services/scheduler.service.ts |

---

## 1. 任务目标

实现定时任务服务模块，使用 `node-cron` 进行任务调度，配合 LINE SDK 实现定时消息推送功能。

## 2. 任务范围

### 2.1 包含内容

- [ ] SchedulerService 类实现
- [ ] Cron 任务调度
- [ ] 任务配置加载 (JSON文件)
- [ ] 第三方 API 调用
- [ ] 消息模板渲染
- [ ] LINE 消息推送
- [ ] 任务执行日志
- [ ] 任务管理接口

### 2.2 不包含内容

- 数据库持久化
- 分布式任务锁
- 任务重试队列

---

## 3. 详细任务清单

### 3.1 任务配置文件

**文件路径：** `src/config/tasks.json`

```json
{
  "tasks": [
    {
      "id": "weather-push",
      "name": "每日天气推送",
      "enabled": true,
      "schedule": "0 8 * * *",
      "api": {
        "url": "https://api.openweathermap.org/data/2.5/weather",
        "method": "GET",
        "headers": {
          "Accept": "application/json"
        }
      },
      "template": "早安！今日天气: {weather}, 温度: {temp}°C",
      "targets": ["U1234567890abcdef"]
    }
  ]
}
```

### 3.2 SchedulerService 类实现

**文件路径：** `src/services/scheduler.service.ts`

```typescript
import cron from 'node-cron';
import { Client } from '@line/bot-sdk';
import axios from 'axios';
import { TaskConfig, TaskExecutionLog } from '../types';
import taskConfigFile from '../config/tasks.json';

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private logs: TaskExecutionLog[] = [];
  
  constructor(private client: Client) {}

  loadTasks(): void {
    const configs = taskConfigFile.tasks;
    
    for (const config of configs) {
      if (!config.enabled) {
        console.log(`Task skipped (disabled): ${config.name}`);
        continue;
      }
      
      if (!cron.validate(config.schedule)) {
        console.error(`Invalid cron: ${config.schedule} for task: ${config.name}`);
        continue;
      }
      
      const task = cron.schedule(config.schedule, () => {
        this.executeTask(config);
      });
      
      this.tasks.set(config.id, task);
      console.log(`Task loaded: ${config.name} (${config.schedule})`);
    }
  }

  private async executeTask(config: TaskConfig): Promise<void> {
    const startTime = Date.now();
    const log: TaskExecutionLog = {
      taskId: config.id,
      executeTime: new Date(),
      status: 'success',
    };
    
    try {
      const response = await axios({
        method: config.api.method,
        url: config.api.url,
        headers: config.api.headers,
        timeout: 30000,
      });

      const message = this.renderTemplate(config.template, response.data);
      
      await this.client.multicast(config.targets, {
        type: 'text',
        text: message,
      });
      
      log.duration = Date.now() - startTime;
      console.log(`Task completed: ${config.name} (${log.duration}ms)`);
      
    } catch (error: any) {
      log.status = 'failed';
      log.error = error.message;
      console.error(`Task failed: ${config.name}`, error);
    }
    
    this.logs.push(log);
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return data[key] !== undefined ? String(data[key]) : '';
    });
  }

  getTaskStatus(): { id: string; running: boolean }[] {
    return Array.from(this.tasks.keys()).map(id => ({
      id,
      running: this.tasks.has(id),
    }));
  }

  getLogs(limit: number = 100): TaskExecutionLog[] {
    return this.logs.slice(-limit);
  }

  stopAll(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
    }
    this.tasks.clear();
    console.log('All tasks stopped');
  }
}
```

---

## 4. API接口说明

### 4.1 loadTasks()

加载并启动所有配置的定时任务。

**返回值：** void

### 4.2 getTaskStatus()

获取所有任务的状态。

**返回值：**
```typescript
{ id: string; running: boolean }[]
```

### 4.3 getLogs(limit?)

获取任务执行日志。

**参数：**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | number | 100 | 返回条数 |

### 4.4 stopAll()

停止所有运行中的任务。

---

## 5. 验收标准

### 5.1 功能验收

- [ ] 任务配置正确加载
- [ ] Cron 表达式验证正确
- [ ] 定时任务按计划执行
- [ ] API 调用成功
- [ ] 模板渲染正确
- [ ] LINE 消息推送成功
- [ ] 执行日志记录完整

### 5.2 错误处理

- [ ] 无效 Cron 表达式跳过
- [ ] API 调用失败记录错误
- [ ] 推送失败不影响其他任务

---

## 6. 测试验证

### 6.1 单元测试

```typescript
describe('SchedulerService', () => {
  it('should load tasks from config', () => {
    const service = new SchedulerService(mockClient);
    service.loadTasks();
    expect(service.getTaskStatus().length).toBeGreaterThan(0);
  });
  
  it('should validate cron expression', () => {
    expect(cron.validate('0 8 * * *')).toBe(true);
    expect(cron.validate('invalid')).toBe(false);
  });
  
  it('should render template correctly', () => {
    const template = '天气: {weather}, 温度: {temp}°C';
    const data = { weather: '晴', temp: 25 };
    const result = renderTemplate(template, data);
    expect(result).toBe('天气: 晴, 温度: 25°C');
  });
});
```

### 6.2 集成测试

```bash
# 启动服务后检查任务状态
curl http://localhost:3000/api/tasks

# 预期响应
{
  "tasks": [
    { "id": "weather-push", "running": true }
  ]
}
```

---

## 7. Cron 表达式参考

| 表达式 | 说明 |
|--------|------|
| `0 8 * * *` | 每天 8:00 |
| `0 9,18 * * *` | 每天 9:00 和 18:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 0 * * 1` | 每周一 0:00 |
| `0 0 1 * *` | 每月 1 号 0:00 |

---

## 8. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 服务重启任务丢失 | 推送中断 | 启动时自动加载 |
| API 调用超时 | 推送延迟 | 设置合理超时 |
| 推送目标过多 | 被限流 | 分批推送 |

---

## 9. 输出物

- [ ] src/services/scheduler.service.ts
- [ ] src/config/tasks.json
- [ ] 更新 src/types/index.ts
- [ ] 更新 src/index.ts (启动任务)
