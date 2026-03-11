# LINE Bot Demo - 智能消息处理系统

一个基于 LINE Messaging API 和大语言模型的智能聊天机器人 Demo 项目。

## 项目简介

本项目是一个 LINE Bot Demo，实现了以下核心功能：

- **智能对话**：集成 LangChain + OpenAI，支持上下文记忆的智能对话
- **消息推送**：支持定时任务调度，可定时推送消息
- **Webhook 处理**：接收 LINE 平台消息事件并自动回复

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 运行时环境 |
| TypeScript | 5.x | 类型安全 |
| Express | 4.x | Web 框架 |
| @line/bot-sdk | 7.x | LINE 官方 SDK |
| LangChain.js | 0.1.x | LLM 应用框架 |
| node-cron | 3.x | 定时任务调度 |

## 项目结构

```
line-bot-demo/
├── src/
│   ├── index.ts                # 入口文件
│   ├── config/
│   │   ├── index.ts            # 配置管理
│   │   └── tasks.json          # 定时任务配置
│   ├── routes/
│   │   ├── webhook.ts          # Webhook 路由
│   │   └── api.ts              # 管理 API 路由
│   ├── services/
│   │   ├── line.service.ts     # LINE 服务
│   │   ├── llm.service.ts      # 大模型服务
│   │   └── scheduler.service.ts # 定时任务服务
│   ├── middleware/
│   │   └── error.middleware.ts # 错误处理中间件
│   └── types/
│       └── index.ts            # 类型定义
├── .env.example                # 环境变量模板
├── package.json
├── tsconfig.json
└── README.md
```

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/abyssCoderox/easy-line.git
cd easy-line
git checkout glm5-coding
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填入真实配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务配置
PORT=3000
NODE_ENV=development

# LINE 配置 (必填)
LINE_CHANNEL_SECRET=your-channel-secret
LINE_CHANNEL_ACCESS_TOKEN=your-access-token

# OpenAI 配置 (必填)
OPENAI_API_KEY=sk-your-openai-api-key

# 第三方 API 密钥 (可选，用于定时推送)
WEATHER_API_KEY=your-weather-api-key
NEWS_API_KEY=your-news-api-key
```

### 4. 获取 LINE 配置

1. 访问 [LINE Developers Console](https://developers.line.biz/console/)
2. 创建 Provider 和 Channel (Messaging API)
3. 获取 `Channel Secret` 和 `Channel Access Token`
4. 配置 Webhook URL (需要公网地址)

### 5. 启动服务

```bash
# 开发模式 (热重载)
npm run dev

# 生产模式
npm run build
npm start
```

### 6. 本地测试 (ngrok)

```bash
# 安装 ngrok (如未安装)
npm install -g ngrok

# 启动隧道
ngrok http 3000

# 将生成的 URL 配置到 LINE Webhook
# 例如: https://xxx.ngrok.io/webhook
```

## API 接口

### 健康检查

```bash
GET /health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2026-03-12T00:00:00.000Z",
  "services": {
    "line": "connected",
    "scheduler": "running",
    "tasks": 0
  }
}
```

### 就绪检查

```bash
GET /ready
```

响应示例：
```json
{
  "ready": true,
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

### Webhook

```bash
POST /webhook
```

接收 LINE 平台推送的消息事件，自动验证签名并处理。

请求头：
| Header | 说明 |
|--------|------|
| X-Line-Signature | LINE 签名 |
| Content-Type | application/json |

### 获取任务状态

```bash
GET /api/tasks
```

响应示例：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "tasks": [
      { "id": "weather-push", "running": true }
    ]
  }
}
```

### 获取任务日志

```bash
GET /api/tasks/logs?limit=100
```

响应示例：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "logs": [
      {
        "taskId": "weather-push",
        "executeTime": "2026-03-12T08:00:00.000Z",
        "status": "success",
        "duration": 1234
      }
    ]
  }
}
```

### 主动推送消息

```bash
POST /api/messages/push
Content-Type: application/json

{
  "targetType": "multicast",
  "targetIds": ["U1234567890", "U0987654321"],
  "messages": [
    { "type": "text", "text": "Hello!" }
  ]
}
```

响应示例：
```json
{
  "code": 0,
  "message": "success",
  "data": { "sentCount": 2 }
}
```

## 定时任务配置

定时任务配置文件：`src/config/tasks.json`

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

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务唯一标识 |
| name | string | 是 | 任务名称 |
| enabled | boolean | 是 | 是否启用 |
| schedule | string | 是 | Cron 表达式 |
| api.url | string | 是 | 第三方 API 地址 |
| api.method | string | 是 | HTTP 方法 |
| api.headers | object | 否 | 请求头 |
| template | string | 是 | 消息模板，支持 `{variable}` 占位符 |
| targets | string[] | 是 | 目标用户 ID 列表 |

### Cron 表达式参考

| 表达式 | 说明 |
|--------|------|
| `0 8 * * *` | 每天 8:00 |
| `0 9,18 * * *` | 每天 9:00 和 18:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 0 * * 1` | 每周一 0:00 |
| `0 0 1 * *` | 每月 1 号 0:00 |

## 开发指南

### 可用脚本

```bash
# 开发模式 (热重载)
npm run dev

# TypeScript 类型检查
npm run typecheck

# 构建
npm run build

# 生产启动
npm start
```

### 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `PORT` | 否 | 服务端口，默认 3000 |
| `NODE_ENV` | 否 | 环境：development/production |
| `LINE_CHANNEL_SECRET` | 是 | LINE Channel Secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | 是 | LINE Channel Access Token |
| `OPENAI_API_KEY` | 是 | OpenAI API Key |

### 常见问题 (FAQ)

**Q: Webhook 验证失败？**
- 检查 `LINE_CHANNEL_SECRET` 是否正确
- 确认 Webhook URL 配置正确
- 检查请求是否来自 LINE 服务器

**Q: 消息发送失败？**
- 检查 `LINE_CHANNEL_ACCESS_TOKEN` 是否有效
- 确认用户已添加 Bot 为好友
- 检查消息格式是否符合 LINE 规范

**Q: LLM 回复异常？**
- 检查 `OPENAI_API_KEY` 是否有效
- 确认 API 余额充足
- 查看控制台错误日志

**Q: 定时任务不执行？**
- 检查 `tasks.json` 中 `enabled` 是否为 `true`
- 验证 Cron 表达式格式
- 确认服务正常运行

## 许可证

MIT License

---

**GitHub**: https://github.com/abyssCoderox/easy-line
