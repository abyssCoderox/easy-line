# API接口设计文档

## 文档信息

| 项目名称 | LINE Bot 智能消息处理系统 |
|---------|-------------------------|
| 文档版本 | V1.0 |
| 创建日期 | 2026-03-11 |
| 文档状态 | 待评审 |

---

## 1. 接口概述

### 1.1 接口规范

| 项目 | 规范 |
|------|------|
| 协议 | HTTPS |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |
| 时间格式 | ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) |
| API版本 | v1 |

### 1.2 基础URL

```
生产环境: https://api.example.com/api/v1
测试环境: https://api-test.example.com/api/v1
```

### 1.3 通用响应格式

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**错误响应：**
```json
{
  "code": 1001,
  "message": "参数错误",
  "errors": [
    {
      "field": "task_name",
      "message": "任务名称不能为空"
    }
  ]
}
```

### 1.4 错误码定义

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 资源不存在 |
| 1003 | 资源已存在 |
| 2001 | 认证失败 |
| 2002 | Token过期 |
| 2003 | 权限不足 |
| 3001 | 服务内部错误 |
| 3002 | 第三方服务错误 |
| 3003 | 服务暂时不可用 |

---

## 2. Webhook接口

### 2.1 LINE Webhook回调

接收LINE服务器推送的消息事件。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /webhook/line` |
| 认证 | 签名验证 (X-Line-Signature) |
| 来源 | LINE服务器 |

**请求头：**

| Header | 类型 | 必填 | 说明 |
|--------|------|------|------|
| X-Line-Signature | string | 是 | 请求签名 |
| Content-Type | string | 是 | application/json |

**请求体：**
```json
{
  "destination": "U1234567890abcdef",
  "events": [
    {
      "type": "message",
      "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
      "timestamp": 1462629479859,
      "source": {
        "type": "user",
        "userId": "U4af4980629..."
      },
      "message": {
        "id": "325708",
        "type": "text",
        "text": "今天天气怎么样"
      }
    }
  ]
}
```

**响应：**
```json
{
  "status": "ok"
}
```

**HTTP状态码：**

| 状态码 | 说明 |
|--------|------|
| 200 | 处理成功 |
| 401 | 签名验证失败 |
| 500 | 服务器错误 |

---

## 3. 定时任务接口

### 3.1 创建定时任务

创建新的定时任务配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/tasks` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "task_name": "每日天气推送",
  "cron_expression": "0 8 * * *",
  "api_endpoint": "https://api.weather.com/v1/current",
  "api_method": "GET",
  "api_headers": {
    "Authorization": "Bearer xxx"
  },
  "api_body": {},
  "message_template": "今日天气: {weather}, 温度: {temp}°C",
  "target_type": "user",
  "target_ids": ["U1234567890", "U0987654321"],
  "enabled": true,
  "retry_count": 3,
  "retry_interval": 1000
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_name": "每日天气推送",
    "cron_expression": "0 8 * * *",
    "enabled": true,
    "created_at": "2026-03-11T10:00:00.000Z"
  }
}
```

### 3.2 获取任务列表

获取所有定时任务配置列表。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/tasks` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认1 |
| page_size | integer | 否 | 每页数量，默认20 |
| enabled | boolean | 否 | 按启用状态筛选 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 10,
    "page": 1,
    "page_size": 20,
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "task_name": "每日天气推送",
        "cron_expression": "0 8 * * *",
        "enabled": true,
        "created_at": "2026-03-11T10:00:00.000Z"
      }
    ]
  }
}
```

### 3.3 获取任务详情

获取指定任务的详细信息。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/tasks/{task_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**路径参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| task_id | string | 是 | 任务ID |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_name": "每日天气推送",
    "cron_expression": "0 8 * * *",
    "api_endpoint": "https://api.weather.com/v1/current",
    "api_method": "GET",
    "api_headers": {},
    "api_body": {},
    "message_template": "今日天气: {weather}, 温度: {temp}°C",
    "target_type": "user",
    "target_ids": ["U1234567890"],
    "enabled": true,
    "retry_count": 3,
    "retry_interval": 1000,
    "created_at": "2026-03-11T10:00:00.000Z",
    "updated_at": "2026-03-11T10:00:00.000Z"
  }
}
```

### 3.4 更新任务配置

更新指定任务的配置信息。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `PUT /api/v1/tasks/{task_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "task_name": "每日天气推送",
  "cron_expression": "0 9 * * *",
  "enabled": true
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "task_name": "每日天气推送",
    "cron_expression": "0 9 * * *",
    "enabled": true,
    "updated_at": "2026-03-11T11:00:00.000Z"
  }
}
```

### 3.5 删除任务

删除指定的定时任务。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `DELETE /api/v1/tasks/{task_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success"
}
```

### 3.6 启用/禁用任务

切换任务的启用状态。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `PATCH /api/v1/tasks/{task_id}/toggle` |
| 认证 | Bearer Token |
| 权限 | admin |

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
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "enabled": false
  }
}
```

### 3.7 手动执行任务

手动触发一次任务执行。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/tasks/{task_id}/execute` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "execution_id": "660e8400-e29b-41d4-a716-446655440000",
    "status": "pending"
  }
}
```

### 3.8 获取任务执行日志

获取指定任务的执行日志列表。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/tasks/{task_id}/logs` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认1 |
| page_size | integer | 否 | 每页数量，默认20 |
| status | string | 否 | 按状态筛选: success, failed |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 100,
    "page": 1,
    "page_size": 20,
    "items": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440000",
        "task_id": "550e8400-e29b-41d4-a716-446655440000",
        "execute_time": "2026-03-11T08:00:00.000Z",
        "status": "success",
        "duration": 1500,
        "created_at": "2026-03-11T08:00:01.500Z"
      }
    ]
  }
}
```

---

## 4. 意图管理接口

### 4.1 获取意图列表

获取所有意图配置列表。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/intents` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| enabled | boolean | 否 | 按启用状态筛选 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "intent_id": "INTENT_WEATHER",
        "intent_name": "天气查询",
        "keywords": ["天气", "气温", "下雨"],
        "patterns": ["今天.*天气", "明天.*天气"],
        "handler": "WeatherHandler",
        "priority": 1,
        "enabled": true
      }
    ]
  }
}
```

### 4.2 创建意图配置

创建新的意图配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/intents` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "intent_id": "INTENT_CUSTOM",
  "intent_name": "自定义意图",
  "keywords": ["关键词1", "关键词2"],
  "patterns": ["正则表达式1", "正则表达式2"],
  "handler": "CustomHandler",
  "priority": 5,
  "enabled": true
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "intent_id": "INTENT_CUSTOM",
    "intent_name": "自定义意图",
    "enabled": true
  }
}
```

### 4.3 更新意图配置

更新指定的意图配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `PUT /api/v1/intents/{intent_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "intent_name": "更新后的意图名称",
  "keywords": ["新关键词1", "新关键词2"],
  "enabled": true
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "intent_id": "INTENT_CUSTOM",
    "intent_name": "更新后的意图名称",
    "updated_at": "2026-03-11T11:00:00.000Z"
  }
}
```

### 4.4 删除意图配置

删除指定的意图配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `DELETE /api/v1/intents/{intent_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success"
}
```

---

## 5. 用户管理接口

### 5.1 获取用户列表

获取所有用户列表。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/users` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认1 |
| page_size | integer | 否 | 每页数量，默认20 |
| status | string | 否 | 按状态筛选: active, blocked |
| keyword | string | 否 | 按昵称搜索 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 1000,
    "page": 1,
    "page_size": 20,
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "line_user_id": "U1234567890abcdef",
        "display_name": "张三",
        "picture_url": "https://example.com/avatar.jpg",
        "status": "active",
        "created_at": "2026-03-01T10:00:00.000Z"
      }
    ]
  }
}
```

### 5.2 获取用户详情

获取指定用户的详细信息。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/users/{user_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "line_user_id": "U1234567890abcdef",
    "display_name": "张三",
    "picture_url": "https://example.com/avatar.jpg",
    "status": "active",
    "created_at": "2026-03-01T10:00:00.000Z",
    "updated_at": "2026-03-01T10:00:00.000Z",
    "stats": {
      "total_messages": 100,
      "last_message_at": "2026-03-11T08:00:00.000Z"
    }
  }
}
```

### 5.3 获取用户对话历史

获取指定用户的对话历史记录。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/users/{user_id}/conversations` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认1 |
| page_size | integer | 否 | 每页数量，默认20 |
| start_date | string | 否 | 开始日期 |
| end_date | string | 否 | 结束日期 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total": 100,
    "page": 1,
    "page_size": 20,
    "items": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440000",
        "role": "user",
        "content": "今天天气怎么样",
        "intent_id": "INTENT_WEATHER",
        "created_at": "2026-03-11T08:00:00.000Z"
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "role": "assistant",
        "content": "今天天气晴朗，温度25°C",
        "intent_id": null,
        "created_at": "2026-03-11T08:00:01.000Z"
      }
    ]
  }
}
```

---

## 6. API配置接口

### 6.1 获取API配置列表

获取所有第三方API配置列表。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/api-configs` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| api_type | string | 否 | 按类型筛选: weather, news, stock, llm |
| enabled | boolean | 否 | 按启用状态筛选 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "api_name": "OpenAI",
        "api_type": "llm",
        "base_url": "https://api.openai.com/v1",
        "timeout": 30000,
        "retry_count": 3,
        "enabled": true,
        "created_at": "2026-03-01T10:00:00.000Z"
      }
    ]
  }
}
```

### 6.2 创建API配置

创建新的API配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/api-configs` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "api_name": "WeatherAPI",
  "api_type": "weather",
  "base_url": "https://api.weather.com/v1",
  "api_key": "your-api-key",
  "timeout": 10000,
  "retry_count": 3,
  "enabled": true
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "api_name": "WeatherAPI",
    "api_type": "weather",
    "enabled": true
  }
}
```

### 6.3 更新API配置

更新指定的API配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `PUT /api/v1/api-configs/{config_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "base_url": "https://api.weather.com/v2",
  "api_key": "new-api-key",
  "timeout": 15000,
  "enabled": true
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "api_name": "WeatherAPI",
    "updated_at": "2026-03-11T11:00:00.000Z"
  }
}
```

### 6.4 删除API配置

删除指定的API配置。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `DELETE /api/v1/api-configs/{config_id}` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success"
}
```

---

## 7. 系统配置接口

### 7.1 获取系统配置

获取系统配置参数。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/system/configs` |
| 认证 | Bearer Token |
| 权限 | admin |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "config_key": "context_max_length",
        "config_value": "3",
        "description": "对话上下文最大条数"
      },
      {
        "config_key": "llm_default_provider",
        "config_value": "openai",
        "description": "默认大模型提供商"
      }
    ]
  }
}
```

### 7.2 更新系统配置

更新系统配置参数。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `PUT /api/v1/system/configs/{config_key}` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "config_value": "5",
  "description": "对话上下文最大条数"
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "config_key": "context_max_length",
    "config_value": "5",
    "updated_at": "2026-03-11T11:00:00.000Z"
  }
}
```

---

## 8. 健康检查接口

### 8.1 健康检查

检查服务健康状态。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /health` |
| 认证 | 无 |

**响应：**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-11T10:00:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "line_api": "healthy"
  }
}
```

### 8.2 就绪检查

检查服务是否就绪接收请求。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /ready` |
| 认证 | 无 |

**响应：**
```json
{
  "ready": true,
  "timestamp": "2026-03-11T10:00:00.000Z"
}
```

---

## 9. 消息推送接口

### 9.1 推送消息

主动向用户推送消息。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/messages/push` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "target_type": "user",
  "target_ids": ["U1234567890", "U0987654321"],
  "messages": [
    {
      "type": "text",
      "text": "这是一条推送消息"
    }
  ]
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sent_count": 2,
    "failed_count": 0
  }
}
```

### 9.2 推送Flex消息

推送Flex Message格式消息。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `POST /api/v1/messages/push-flex` |
| 认证 | Bearer Token |
| 权限 | admin |

**请求体：**
```json
{
  "target_type": "user",
  "target_ids": ["U1234567890"],
  "alt_text": "Flex消息",
  "contents": {
    "type": "bubble",
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        {
          "type": "text",
          "text": "Hello World"
        }
      ]
    }
  }
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "sent_count": 1,
    "failed_count": 0
  }
}
```

---

## 10. 统计接口

### 10.1 获取消息统计

获取消息处理统计数据。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/statistics/messages` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_date | string | 是 | 开始日期 |
| end_date | string | 是 | 结束日期 |
| granularity | string | 否 | 粒度: day, hour |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total_messages": 10000,
    "by_intent": [
      {
        "intent_id": "INTENT_WEATHER",
        "count": 3000
      },
      {
        "intent_id": "INTENT_UNKNOWN",
        "count": 2000
      }
    ],
    "by_date": [
      {
        "date": "2026-03-11",
        "count": 500
      }
    ]
  }
}
```

### 10.2 获取用户统计

获取用户活跃统计数据。

**请求信息：**

| 项目 | 说明 |
|------|------|
| URL | `GET /api/v1/statistics/users` |
| 认证 | Bearer Token |
| 权限 | admin |

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_date | string | 是 | 开始日期 |
| end_date | string | 是 | 结束日期 |

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total_users": 1000,
    "active_users": 500,
    "new_users": 50,
    "by_date": [
      {
        "date": "2026-03-11",
        "active": 100,
        "new": 5
      }
    ]
  }
}
```

---

## 11. 附录

### 11.1 认证方式

**Bearer Token认证：**
```
Authorization: Bearer <access_token>
```

### 11.2 请求限流

| 接口类型 | 限流规则 |
|---------|---------|
| Webhook | 无限制（来自LINE服务器） |
| 管理接口 | 100次/分钟/IP |
| 公开接口 | 60次/分钟/IP |

### 11.3 修订历史

| 版本 | 日期 | 修订人 | 修订内容 |
|------|------|--------|---------|
| V1.0 | 2026-03-11 | - | 初始版本 |

---

**文档评审意见：**

| 评审人 | 评审日期 | 评审意见 | 状态 |
|--------|---------|---------|------|
|        |         |         | 待评审 |
