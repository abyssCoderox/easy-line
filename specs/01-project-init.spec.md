# Spec: 项目初始化

## 任务概述

| 属性 | 值 |
|------|-----|
| 任务ID | SPEC-001 |
| 任务名称 | 项目初始化 |
| 优先级 | P0 (最高) |
| 预计工时 | 2小时 |
| 依赖任务 | 无 |
| 负责模块 | 项目基础设施 |

---

## 1. 任务目标

搭建 LINE Bot Demo 项目的基础开发环境，包括项目结构、依赖安装、配置文件、TypeScript配置等。

## 2. 任务范围

### 2.1 包含内容

- [ ] 创建项目目录结构
- [ ] 初始化 package.json
- [ ] 配置 TypeScript
- [ ] 安装核心依赖
- [ ] 创建环境变量配置
- [ ] 创建入口文件框架
- [ ] 配置开发脚本

### 2.2 不包含内容

- 业务逻辑实现
- 服务模块实现
- 路由实现

---

## 3. 详细任务清单

### 3.1 创建项目目录结构

```
line-bot-demo/
├── src/
│   ├── index.ts              # 入口文件
│   ├── config/
│   │   ├── index.ts          # 配置管理
│   │   └── tasks.json        # 定时任务配置
│   ├── routes/
│   │   ├── webhook.ts        # Webhook路由
│   │   └── api.ts            # 管理API路由
│   ├── services/
│   │   ├── line.service.ts   # LINE服务
│   │   ├── llm.service.ts    # 大模型服务
│   │   ├── scheduler.service.ts  # 定时任务服务
│   │   └── api.service.ts    # 第三方API服务
│   ├── handlers/
│   │   └── message.handler.ts    # 消息处理器
│   ├── middleware/
│   │   └── error.middleware.ts   # 错误处理中间件
│   └── types/
│       └── index.ts          # 类型定义
├── .env                       # 环境变量
├── .env.example               # 环境变量示例
├── package.json
├── tsconfig.json
└── README.md
```

### 3.2 初始化 package.json

```json
{
  "name": "line-bot-demo",
  "version": "1.0.0",
  "description": "LINE Bot Demo - 智能消息处理系统",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["line-bot", "chatbot", "langchain"],
  "author": "",
  "license": "MIT"
}
```

### 3.3 配置 TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.4 安装核心依赖

**生产依赖：**
```bash
npm install @line/bot-sdk@^7.5.2
npm install express@^4.18.2
npm install dotenv@^16.3.1
npm install node-cron@^3.0.3
npm install axios@^1.6.0
npm install langchain@^0.1.0
npm install @langchain/openai@^0.0.19
```

**开发依赖：**
```bash
npm install -D typescript@^5.3.0
npm install -D @types/express@^4.17.21
npm install -D @types/node@^20.10.0
npm install -D @types/node-cron@^3.0.11
npm install -D tsx@^4.7.0
npm install -D nodemon@^3.0.2
```

### 3.5 创建环境变量配置

**.env.example:**
```bash
# 服务配置
PORT=3000
NODE_ENV=development

# LINE配置
LINE_CHANNEL_SECRET=your-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-access-token

# OpenAI配置
OPENAI_API_KEY=sk-your-openai-api-key

# 第三方API密钥（可选）
WEATHER_API_KEY=your-weather-api-key
NEWS_API_KEY=your-news-api-key
```

### 3.6 创建入口文件框架

**src/index.ts:**
```typescript
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 3.7 创建类型定义文件

**src/types/index.ts:**
```typescript
export interface AppConfig {
  port: number;
  line: {
    channelSecret: string;
    channelAccessToken: string;
  };
  openai: {
    apiKey: string;
  };
}

export interface TaskConfig {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  api: {
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Record<string, any>;
  };
  template: string;
  targets: string[];
}

export interface TaskConfigFile {
  tasks: TaskConfig[];
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface TaskExecutionLog {
  taskId: string;
  executeTime: Date;
  status: 'success' | 'failed';
  duration?: number;
  error?: string;
}
```

---

## 4. 验收标准

### 4.1 功能验收

- [ ] 项目目录结构完整
- [ ] package.json 配置正确
- [ ] TypeScript 编译无错误
- [ ] `npm run dev` 启动成功
- [ ] 访问 `/health` 返回正常
- [ ] 环境变量加载正确

### 4.2 代码质量

- [ ] 无 TypeScript 编译错误
- [ ] 无 ESLint 警告
- [ ] 代码格式统一

---

## 5. 测试验证

### 5.1 启动测试

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 测试健康检查
curl http://localhost:3000/health
```

### 5.2 预期输出

```json
{
  "status": "ok",
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

---

## 6. 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Node.js版本过低 | SDK不兼容 | 使用Node.js 18+ |
| 依赖版本冲突 | 运行时错误 | 锁定版本号 |
| 环境变量缺失 | 启动失败 | 提供.env.example |

---

## 7. 输出物

- [ ] 完整的项目目录结构
- [ ] package.json
- [ ] tsconfig.json
- [ ] .env.example
- [ ] src/index.ts (框架)
- [ ] src/types/index.ts
