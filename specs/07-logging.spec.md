# Spec: 日志记录功能

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-007 |
| 任务名称 | 日志记录功能开发 |
| 优先级 | P2 (中) |
| 预计工时 | 4小时 |
| 依赖任务 | SPEC-001 (项目初始化) |
| 负责模块 | src/services/logger.service.ts, src/middleware/logging.middleware.ts |

---

## 1. 任务目标

实现完整的日志记录功能，支持 error、warn、info 三个级别的日志持久化到文件系统，覆盖 HTTP 请求、定时任务执行和系统运行事件等场景。

---

## 2. 功能需求

### 2.1 日志级别

| 级别 | 说明 | 使用场景 |
|------|------|---------|
| error | 错误日志 | 异常、错误、失败操作 |
| warn | 警告日志 | 潜在问题、非预期情况 |
| info | 信息日志 | 正常操作、重要事件 |

### 2.2 覆盖场景

#### 2.2.1 HTTP 请求日志

记录内容：
- 请求方法 (GET/POST/PUT/DELETE)
- 请求 URL
- 请求头 (可选)
- 请求体 (可选，敏感信息脱敏)
- 响应状态码
- 响应时间 (ms)
- 客户端 IP

#### 2.2.2 定时任务日志

记录内容：
- 任务 ID
- 任务名称
- 执行开始时间
- 执行结束时间
- 执行耗时 (ms)
- 执行状态 (success/failed)
- 错误信息 (如有)

#### 2.2.3 系统运行日志

记录内容：
- 服务启动/关闭
- 配置加载
- 服务状态变更
- 其他重要事件

---

## 3. 日志文件规范

### 3.1 文件结构

```
logs/
├── error/
│   ├── error-2026-03-14.log
│   ├── error-2026-03-13.log
│   └── ...
├── warn/
│   ├── warn-2026-03-14.log
│   └── ...
└── info/
    ├── info-2026-03-14.log
    └── ...
```

### 3.2 日志格式

每条日志包含以下要素：

```
[时间戳] [级别] [模块] 消息内容 {元数据}
```

示例：
```
[2026-03-14T10:30:00.123Z] [INFO] [HTTP] Request completed {"method":"POST","url":"/api/chat","statusCode":200,"duration":150}
[2026-03-14T10:30:01.456Z] [ERROR] [Scheduler] Task execution failed {"taskId":"task-001","error":"Network timeout"}
```

### 3.3 日志轮转机制

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| maxFileSize | 10MB | 单个日志文件最大大小 |
| maxFiles | 30 | 保留的历史日志文件数量 |
| compress | false | 是否压缩旧日志文件 |

---

## 4. API 设计

### 4.1 LoggerService 类

```typescript
class LoggerService {
  info(module: string, message: string, meta?: object): void;
  warn(module: string, message: string, meta?: object): void;
  error(module: string, message: string, meta?: object): void;
  http(req: Request, res: Response, duration: number): void;
  task(taskId: string, taskName: string, status: 'success' | 'failed', duration: number, error?: string): void;
}
```

### 4.2 预定义模块名

| 模块名 | 说明 |
|--------|------|
| HTTP | HTTP 请求处理 |
| Scheduler | 定时任务 |
| LLM | 大模型服务 |
| LINE | LINE 服务 |
| Config | 配置管理 |
| Server | 服务器 |

---

## 5. 配置项

### 5.1 环境变量

```bash
# 日志配置
LOG_LEVEL=info                    # 最低日志级别: error, warn, info
LOG_DIR=logs                      # 日志目录
LOG_MAX_FILE_SIZE=10485760        # 单文件最大大小 (字节)，默认 10MB
LOG_MAX_FILES=30                  # 最大保留文件数
LOG_CONSOLE=true                  # 是否同时输出到控制台
```

### 5.2 类型定义

```typescript
interface LoggerConfig {
  level: 'error' | 'warn' | 'info';
  dir: string;
  maxFileSize: number;
  maxFiles: number;
  console: boolean;
}

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  module: string;
  message: string;
  meta?: Record<string, any>;
}
```

---

## 6. 实现细节

### 6.1 日志写入策略

- 使用异步写入，避免阻塞主线程
- 批量写入优化 (可选)
- 写入失败时降级到控制台输出

### 6.2 性能考量

- 日志写入使用独立队列
- 不阻塞业务逻辑执行
- 文件写入使用 append 模式
- 定期检查文件大小并轮转

### 6.3 错误处理

- 文件写入失败时记录到控制台
- 日志目录不存在时自动创建
- 磁盘空间不足时优雅降级

---

## 7. 使用示例

### 7.1 基础使用

```typescript
import { logger } from './services/logger.service';

// 信息日志
logger.info('Server', 'Server started', { port: 3000 });

// 警告日志
logger.warn('Config', 'Using default configuration', { key: 'timeout' });

// 错误日志
logger.error('LLM', 'LLM call failed', { error: err.message, userId });
```

### 7.2 HTTP 请求日志

```typescript
// 在中间件中自动记录
app.use(loggingMiddleware);
```

### 7.3 定时任务日志

```typescript
// 在 scheduler.service.ts 中使用
logger.task(taskId, taskName, 'success', duration);
logger.task(taskId, taskName, 'failed', duration, errorMessage);
```

---

## 8. 文件结构

### 8.1 新增文件

| 文件 | 说明 |
|------|------|
| src/services/logger.service.ts | 日志服务 |
| src/middleware/logging.middleware.ts | HTTP 请求日志中间件 |
| src/types/logger.ts | 日志相关类型定义 |

### 8.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| src/types/index.ts | 导出日志类型 |
| src/config/index.ts | 添加日志配置 |
| src/index.ts | 集成日志中间件 |
| src/services/scheduler.service.ts | 使用日志服务 |
| src/services/llm.service.ts | 使用日志服务 |
| .env.example | 添加日志配置项 |

---

## 9. 测试验证

### 9.1 单元测试

```typescript
describe('LoggerService', () => {
  it('should write info log', () => {
    logger.info('Test', 'Test message');
    // 验证文件写入
  });
  
  it('should rotate log file when size exceeds limit', () => {
    // 验证轮转逻辑
  });
  
  it('should handle write errors gracefully', () => {
    // 验证错误处理
  });
});
```

### 9.2 集成测试

```bash
# 启动服务
npm run dev

# 发送请求
curl -X POST http://localhost:3000/api/chat \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","message":"hello"}'

# 检查日志文件
cat logs/info/info-$(date +%Y-%m-%d).log
```

---

## 10. 验收标准

### 10.1 功能验收

- [ ] 日志按级别分别存储到不同目录
- [ ] 日志格式包含时间戳、级别、模块、消息、元数据
- [ ] HTTP 请求自动记录
- [ ] 定时任务执行自动记录
- [ ] 日志轮转正常工作
- [ ] 控制台输出可选

### 10.2 性能验收

- [ ] 日志写入不阻塞主线程
- [ ] 大量日志写入不影响服务性能

### 10.3 稳定性验收

- [ ] 日志目录不存在时自动创建
- [ ] 写入失败时优雅降级
- [ ] 服务异常关闭时日志不丢失

---

## 11. 输出物

- [ ] src/services/logger.service.ts
- [ ] src/middleware/logging.middleware.ts
- [ ] src/types/logger.ts
- [ ] 更新相关服务和配置文件
- [ ] 单元测试文件
