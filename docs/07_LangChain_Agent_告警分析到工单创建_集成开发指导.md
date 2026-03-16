# LangChain Agent 集成开发指导

## 1. 目标

本文面向“现有 LangChain Agent 系统”集成当前项目的告警分析与工单创建能力，目标是把现有接口以 `tools` 的方式纳入框架，打通下面这条主链路：

1. 获取告警列表
2. 对话要求对获取到的告警进行分析
3. 根据分析结果，询问是否派单
4. 对话创建工单创建任务
5. 返回创建工单结果

本文只基于当前仓库已确认接口与现有接入文档，不假设额外中台能力。

## 2. 结论先行

对接这条链路，建议最少接入 4 类能力：

- `create_alarm_session`
- `list_alarms`
- `analyze_alarm`
- `create_work_order`


其中第 3 步“询问是否派单”不建议做成真实后端 tool，而建议作为 LangChain agent 的人机确认节点：

- 由 agent 读取分析结果
- 生成结构化确认问题
- 等待用户明确回答“是/否”
- 用户确认后再调用 `create_work_order`

这样最稳，也最符合当前演示主链路。

## 3. 现有接口与流程映射

## 3.1 当前真实接口来源

当前链路并不是全部来自同一个服务：

- 告警列表、会话、告警分析、人工修正：当前 FastAPI 服务
- 工单创建：外部 Dify Workflow API

对应接口如下：

| 流程步骤 | 能力 | 实际接口 |
|------|------|------|
| 1 | 获取告警列表 | `GET /api/v1/alarms` |
| 2 | 告警分析 | `POST /api/v1/process_alarms` |
| 2-补充 | 会话初始化 | `POST /api/v1/new_session` |
| 3 | 是否派单确认 | 建议由 agent 自己完成，不走后端接口 |
| 4 | 创建工单 | `POST http://192.168.100.225:8088/v1/workflows/run` |
| 5 | 返回工单结果 | 解析 Dify Workflow 返回结果 |

补充辅助接口：

| 用途 | 接口 |
|------|------|
| 查询会话状态 | `GET /api/v1/session/{session_id}` |
| 人工修正 AI 决策 | `POST /api/v1/decision/override` |

## 3.2 推荐调用顺序

建议在 LangChain 里固定成下面的执行顺序：

1. 首次进入告警链路时调用 `create_alarm_session`
2. 调用 `list_alarms`
3. 让 agent 从用户表达中识别要分析的告警
4. 调用 `analyze_alarm`
5. agent 总结分析结果，并追问“是否创建工单”
6. 用户明确同意后，调用 `create_work_order`
7. agent 返回结构化工单结果

## 4. Tool 设计建议

## 4.1 推荐的 Tool 清单

### Tool 1: `create_alarm_session`

用途：

- 创建一次告警分析会话
- 为后续 `analyze_alarm` 提供 `session_id`

后端接口：

- `POST /api/v1/new_session`

输入建议：

```json
{}
```

输出建议：

```json
{
  "session_id": "uuid"
}
```

### Tool 2: `list_alarms`

用途：

- 获取当前告警列表
- 给 agent 提供候选告警集

后端接口：

- `GET /api/v1/alarms`

输入建议：

```json
{
  "status": "",
  "page": 1,
  "page_size": 20
}
```

补充说明：

- `status` 默认传空字符串，表示不过滤处理状态。

输出建议：

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
        "raw_data": "{\"id\": 101,\n      \"device_sn\": \"INV-0001\",\n      \"site_name\": \"Bangkok PV Site\",\n      \"alarm_code\": \"130\",\n      \"processing_status\": \"Untreated\",\n      \"created_at\": \"2026-03-16 09:20:00\"}"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  }
}
```

封装建议：
- 只保留 agent 必须用的核心字段
- 原始完整响应可放在 `raw` 字段里备用

### Tool 3: `analyze_alarm`

用途：

- 对指定告警执行流式分析
- 输出面向 agent 的结构化分析结论

后端接口：

- `POST /api/v1/process_alarms`

输入建议：

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

输出建议：

```json
data: {"type": "content", "text": "正在从业务平台获取实时数据，请稍候...\n"} data: {"type": "content", "text": "正在为您调取 test_huawei_sanrui8 等 1 条告警在平台内的实例数据并启动专家研判...\n"} data: {"type": "agent_log", "log_type": "observation", "payload": {"content": "正在初始化诊断引擎..."}} data: {"type": "agent_log", "log_type": "plan", "payload": {"steps": [{"index": 1, "name": "上下文检查", "status": "pending"}, {"index": 2, "name": "规则引擎", "status": "pending"}, {"index": 3, "name": "决策生成", "status": "pending"}]}} data: {"type": "agent_log", "log_type": "observation", "payload": {"content": "正在匹配告警分析历史数据..."}} data: {"type": "agent_log", "log_type": "observation", "payload": {"content": "历史分析完成: 新增 0 | 更新 1 | 过滤重复 0<details>\n<summary style=\"cursor:pointer; color:#60a5fa; font-size:12px; margin-top:4px; list-style:none; font-weight:bold;\">\n<span style=\"display:inline-block; width:16px;\">▶</span> 点击查看历史分析详情 (1条)\n</summary>\n<div style=\"margin-top:8px; font-size:12px; color:#94a3b8; background:rgba(0,0,0,0.2); border-radius:6px; padding:8px;\">\n<table style=\"width:100%; text-align:left; border-collapse:collapse;\">\n<tr style=\"border-bottom:1px solid #475569; color:#f1f5f9;\">\n<th style=\"padding:4px;\">ID</th>\n<th style=\"padding:4px;\">Status</th>\n<th style=\"padding:4px;\">Action</th>\n<th style=\"padding:4px;\">Level</th>\n<th style=\"padding:4px;\">Tags</th>\n<th style=\"padding:4px;\">Conf.</th>\n<th style=\"padding:4px;\">Reason</th>\n</tr>\n\n <tr style=\"border-bottom:1px solid rgba(255,255,255,0.05);\">\n <td style=\"padding:4px; font-family:monospace;\">2033384147480158208</td>\n <td style=\"padding:4px;\">🔄 update</td>\n <td style=\"padding:4px;\">close</td>\n <td style=\"padding:4px;\">C_Secondary</td>\n <td style=\"padding:4px; font-size:10px;\">组串报警,LLM_Analyzed</td>\n <td style=\"padding:4px;\">85</td>\n <td style=\"padding:4px; max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;\" title=\"[建议自愈待复核] 业务库近10分钟未监测到该设备任何新告警 | 告警已恢复且无复发，建议关闭/忽略\">[建议自愈待复核] 业务库近1..</td>\n </tr>\n</table>\n</div>\n</details>"}} data: {"type": "agent_log", "log_type": "step_complete", "payload": {"step_index": 1, "summary": "已加载 2 条活跃观察任务，其中 1 条与当前告警关联"}} data: {"type": "agent_log", "log_type": "thought", "payload": {"content": "正在查询72小时内关联告警数据..."}} data: {"type": "agent_log", "log_type": "step_complete", "payload": {"step_index": 2, "summary": "关联分析完成: 72h内无相关历史告警"}} data: {"type": "agent_log", "log_type": "thought", "payload": {"content": "正在分析告警并生成处置建议..."}} data: {"type": "agent_log", "log_type": "observation", "payload": {"content": "<b>诊断追踪 (test_huawei_sanrui8)</b>:<br/><div style='font-family:sans-serif; font-size:0.9rem; line-height:1.5'><div style='background:rgba(139,92,246,0.15); border-left:3px solid #8b5cf6; padding:6px 10px; margin-bottom:6px; border-radius:4px; color:#c4b5fd;'><i class='fas fa-link'></i> 关联活跃追踪记录 (ID匹配): ID=1 (pending_close_review) - 同一告警持续</div><div style='background:rgba(59,130,246,0.1); border-left:3px solid #3b82f6; padding:8px; margin-bottom:8px; border-radius:4px;'><div style='color:#60a5fa; font-size:0.9em; font-weight:bold; margin-bottom:6px;'><i class='fas fa-history'></i> 历史研判回溯</div><div style='color:#e2e8f0; font-size:0.95em;'><div style='display:flex; flex-direction:column; gap:4px;'><div style='display:flex; align-items:baseline;'><span style='color:#60a5fa; margin-right:6px; font-size:1.2em;'>•</span> <span>等待业务自愈复核 (状态: 2015: Unknown)</span></div><div style='display:flex; align-items:baseline;'><span style='color:#60a5fa; margin-right:6px; font-size:1.2em;'>•</span> <span><span style='color:#94a3b8; font-family:monospace; margin-right:6px'>建议自愈待复核</span> 业务库近10分钟未监测到该设备任何新告警 | 告警已恢复且无复发，建议关闭/忽略</span></div><div style='display:flex; align-items:baseline;'><span style='color:#60a5fa; margin-right:6px; font-size:1.2em;'>•</span> <span>告警持续时间短且自动恢复，无关联告警，建议观察。</span></div></div></div></div><div style='margin-top:4px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); padding:6px; border-radius:4px; color:#6ee7b7'><i class='fas fa-check-circle'></i> 匹配规则: <b>组串报警</b><div style='color:#94a3b8;font-size:0.85em;margin-top:2px;'><b>规则说明:</b> 环境或波动因素，建议观察。匹配条件：告警名称中包含 [String Alarm/组串报警] 之一，同时告警依然活跃且未恢复</div></div><div style='margin-top:8px; background:linear-gradient(90deg, rgba(59,130,246,0.15), transparent); border-left:3px solid #3b82f6; padding:8px; border-radius:4px;'><div style='color:#60a5fa; font-weight:bold; margin-bottom:4px;'><i class='fas fa-robot'></i> AI 分析</div><div style='color:#e2e8f0; font-size:0.95em;'>告警持续时间短且自动恢复，无关联告警，建议观察。</div></div></div>"}} data: {"type": "agent_log", "log_type": "observation", "payload": {"content": "设备 test_huawei_sanrui8 → 持续观察"}} data: {"type": "decision_results", "content": "\n## 📋 设备告警处理决策结果\n\n<div style=\"display:flex;gap:10px;margin-bottom:16px;\">\n<div style=\"flex:1;text-align:center;padding:12px 8px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:10px;min-width:0;\">\n<div style=\"color:#ef4444;display:flex;justify-content:center;margin-bottom:2px;\"><svg style=\"width:22px;height:22px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01\"></path></svg></div>\n<div id=\"kpi-count-dispatch\" style=\"font-size:1.6em;font-weight:700;color:#ef4444;line-height:1.2;\">0</div>\n<div style=\"font-size:0.72em;color:#94a3b8;margin-top:2px;\">派单</div>\n</div><div style=\"flex:1;text-align:center;padding:12px 8px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);border-radius:10px;min-width:0;\">\n<div style=\"color:#3b82f6;display:flex;justify-content:center;margin-bottom:2px;\"><svg style=\"width:22px;height:22px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M15 12a3 3 0 11-6 0 3 3 0 016 0z\"></path><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z\"></path></svg></div>\n<div id=\"kpi-count-observe\" style=\"font-size:1.6em;font-weight:700;color:#3b82f6;line-height:1.2;\">1</div>\n<div style=\"font-size:0.72em;color:#94a3b8;margin-top:2px;\">观察</div>\n</div><div style=\"flex:1;text-align:center;padding:12px 8px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.25);border-radius:10px;min-width:0;\">\n<div style=\"color:#22c55e;display:flex;justify-content:center;margin-bottom:2px;\"><svg style=\"width:22px;height:22px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z\"></path></svg></div>\n<div id=\"kpi-count-close\" style=\"font-size:1.6em;font-weight:700;color:#22c55e;line-height:1.2;\">0</div>\n<div style=\"font-size:0.72em;color:#94a3b8;margin-top:2px;\">关闭</div>\n</div><div style=\"flex:1;text-align:center;padding:12px 8px;background:rgba(100,116,139,0.12);border:1px solid rgba(100,116,139,0.25);border-radius:10px;min-width:0;\">\n<div style=\"color:#64748b;display:flex;justify-content:center;margin-bottom:2px;\"><svg style=\"width:22px;height:22px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16\"></path></svg></div>\n<div id=\"kpi-count-ignore\" style=\"font-size:1.6em;font-weight:700;color:#64748b;line-height:1.2;\">0</div>\n<div style=\"font-size:0.72em;color:#94a3b8;margin-top:2px;\">忽略</div>\n</div>\n</div>\n<div style=\"text-align:right;color:#475569;font-size:0.75em;margin:-10px 0 12px;\">共 1 条</div>\n\n<div class=\"decision-card\" data-alarm-id=\"2033384147480158208\" data-original-level=\"MEDIUM\" data-original-action=\"observe\" data-original-confidence=\"85\" data-original-reason=\"告警持续时间短且自动恢复，无关联告警，建议观察。\" style=\"background:linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.9)); border:1px solid rgba(255,255,255,0.08); border-left:4px solid #3b82f6; border-radius:10px; padding:18px; margin-bottom:14px;\">\n<div style=\"display:grid;grid-template-columns:repeat(2,1fr);gap:12px 16px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);\">\n<div><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">告警编号</div><div style=\"color:#e2e8f0;font-size:0.88em;font-weight:500;margin-top:2px;\">URJ2033384147451514880</div></div>\n<div><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">设备名称</div><div style=\"color:#e2e8f0;font-size:0.88em;font-weight:500;margin-top:2px;\">test_huawei_sanrui8</div></div>\n<div><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">告警类型</div><div style=\"color:#e2e8f0;font-size:0.88em;font-weight:500;margin-top:2px;\">组串报警</div></div>\n<div><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">电站</div><div style=\"color:#e2e8f0;font-size:0.88em;font-weight:500;margin-top:2px;\">sanrui测试电站8号</div></div>\n</div>\n<div class=\"display-mode\" data-alarm-id=\"2033384147480158208\">\n<div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px;\">\n<div style=\"background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;\"><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">等级</div><div class=\"val-level\" style=\"margin-top:4px;\"><span style=\"background:#eab308;color:white;padding:3px 10px;border-radius:12px;font-size:0.82em;font-weight:600;\">一般</span></div><div class=\"change-diff change-diff-level\" style=\"display:none;margin-top:6px;\"></div></div>\n<div style=\"background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;\"><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">置信度</div><div class=\"val-confidence\" style=\"margin-top:4px;\"><span style=\"background:rgba(255,255,255,0.05);border:1px solid #eab308;color:#eab308;padding:3px 10px;border-radius:12px;font-size:0.82em;font-weight:600;\">85%</span></div><div class=\"change-diff change-diff-confidence\" style=\"display:none;margin-top:6px;\"></div></div>\n<div style=\"background:rgba(255,255,255,0.03);border-radius:8px;padding:10px 12px;\"><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;\">处理建议</div><div class=\"val-action\" style=\"margin-top:4px;\"><span style=\"background:#3b82f6;color:white;padding:3px 10px;border-radius:12px;font-size:0.82em;font-weight:600;\">观察</span></div><div class=\"change-diff change-diff-action\" style=\"display:none;margin-top:6px;\"></div></div>\n</div>\n<div style=\"margin-bottom:12px;\"><div style=\"color:#64748b;font-size:0.72em;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;;margin-bottom:6px;\">研判理由</div><div class=\"val-reason\" style=\"color:#cbd5e1;font-size:0.88em;line-height:1.6;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.05);\">告警持续时间短且自动恢复，无关联告警，建议观察。</div></div>\n<div style=\"display:flex;gap:6px;\"><button class=\"btn-toggle-edit\" data-alarm-id=\"2033384147480158208\" style=\"background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#818cf8;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.8em;display:inline-flex;align-items:center;\"><svg style=\"width:14px;height:14px;vertical-align:middle;margin-right:3px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z\"></path></svg>修改</button><button class=\"btn-reanalyze\" data-alarm-id=\"2033384147480158208\" style=\"background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);color:#eab308;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.8em;display:inline-flex;align-items:center;\"><svg style=\"width:14px;height:14px;vertical-align:middle;margin-right:3px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15\"></path></svg>重新研判</button></div>\n</div>\n<div class=\"edit-mode\" data-alarm-id=\"2033384147480158208\" style=\"display:none;\">\n<div style=\"display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;\">\n<div><div style=\"color:#64748b;font-size:0.75em;margin-bottom:4px;\">等级</div><select class=\"edit-level\" data-alarm-id=\"2033384147480158208\" style=\"background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:0.85em;width:100%;\"><option value=\"CRITICAL\" >紧急</option><option value=\"HIGH\" >重要</option><option value=\"MEDIUM\" selected>一般</option><option value=\"LOW\" >低</option></select></div>\n<div><div style=\"color:#64748b;font-size:0.75em;margin-bottom:4px;\">置信度</div><input type=\"number\" class=\"edit-confidence\" data-alarm-id=\"2033384147480158208\" value=\"85\" min=\"0\" max=\"100\" style=\"width:70px;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;text-align:center;font-size:0.85em;\"/>%</div>\n<div><div style=\"color:#64748b;font-size:0.75em;margin-bottom:4px;\">处理建议</div><select class=\"edit-action\" data-alarm-id=\"2033384147480158208\" style=\"background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:0.85em;width:100%;\"><option value=\"dispatch\" >派单</option><option value=\"observe\" selected>观察</option><option value=\"close\" >关闭</option><option value=\"ignore\" >忽略</option></select></div>\n</div>\n<div style=\"margin-bottom:10px;\"><div style=\"color:#64748b;font-size:0.75em;margin-bottom:4px;\">理由</div><textarea class=\"edit-reason\" data-alarm-id=\"2033384147480158208\" rows=\"3\" style=\"width:100%;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;font-size:0.85em;resize:vertical;font-family:inherit;line-height:1.4;\">告警持续时间短且自动恢复，无关联告警，建议观察。</textarea></div>\n<div style=\"display:flex;gap:6px;\"><button class=\"btn-save-override\" data-alarm-id=\"2033384147480158208\" style=\"background:rgba(59,130,246,0.2);border:1px solid #3b82f6;color:#60a5fa;border-radius:6px;padding:4px 14px;cursor:pointer;font-size:0.8em;display:inline-flex;align-items:center;\"><svg style=\"width:14px;height:14px;vertical-align:middle;margin-right:3px;\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4\"></path></svg>保存</button><button class=\"btn-cancel-edit\" data-alarm-id=\"2033384147480158208\" style=\"background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:6px;padding:4px 14px;cursor:pointer;font-size:0.8em;\">取消</button></div>\n</div>\n</div>\n"} data: {"type": "content", "text": "已完成 **1** 条告警的智能研判。其中 **1** 条建议观察。\n\n详细的研判建议卡片已在下方显示，您可以在其上直接进行修改或派单操作。"} data: {"type": "agent_log", "log_type": "step_complete", "payload": {"step_index": 3, "summary": "分析完成，已生成 1 条智能决策"}} data: [DONE]
```

关键说明：

- 后端实际返回是 SSE，不是普通 JSON
- Tool 封装层需要负责消费 SSE，让大模型使用如下提示词拼接成 LINE 官方 Flex Message

``` markdown
你是一个“LINE Flex Message 告警卡片生成助手”。

我会给你一段由多行 `data: ...` 组成的流式消息，内容可能包含：
- 普通文本消息（type=content）
- Agent 日志（type=agent_log）
- 最终决策结果（type=decision_results）
- HTML 标签、details/table/div/button/svg/style 等展示性内容

你的任务不是输出摘要文本，而是：
**从整段消息中提取关键信息，并生成一个符合 LINE Messaging API 规范的 Flex Message JSON。**

## 目标
将告警研判结果转换成可直接发送给 LINE Bot 的 Flex Message。

## 输出要求
1. 只输出 JSON
2. 不要输出 Markdown
3. 不要输出代码块
4. 不要输出解释说明
5. JSON 必须符合 LINE Flex Message 结构
6. 顶层必须是：
   - `type: "flex"`
   - `altText`
   - `contents`
7. 如果只有 1 条告警，`contents` 使用 `bubble`
8. 如果有多条告警，`contents` 使用 `carousel`
9. 不要输出 HTML 标签
10. 不要输出按钮“修改 / 保存 / 取消 / 重新研判”等前端编辑控件
11. 信息缺失时不要编造，缺失字段可以省略或写“未提及”
12. 所有较长文本必须加 `wrap: true`

## 提取内容
请从原始流式消息中提取这些业务信息：
- 研判状态
- 告警总数
- 各处理建议数量（派单 / 观察 / 关闭 / 忽略）
- 设备名称
- 告警编号
- 内部记录ID
- 告警类型
- 电站名称
- 活跃观察任务数量
- 关联任务数量
- 72小时关联历史告警情况
- 历史分析结论
- 匹配规则及规则说明
- 最终建议动作
- 告警等级
- 置信度
- 研判理由
- 关键风险信号（如：自动恢复、持续观察、待复核、无关联告警）

## 卡片结构要求
请使用一个简洁、稳定、兼容性高的 bubble 结构：

- header：显示标题，如“告警研判结果”
- body：显示核心字段
- footer：最多放 1~2 个静态说明按钮；如果没有可靠跳转地址，则不要放按钮

建议 body 包含以下模块：
1. 任务概览
2. 告警对象
3. 最终决策
4. 补充分析 / 关键信号

## 样式要求
- 整体风格简洁，适合运维告警通知
- 标题加粗
- 关键结论单独突出
- 风险或待观察信息可用醒目标识
- 长文本必须 `wrap: true`
- 不使用复杂 hero 视频
- 尽量避免过深层级嵌套

## 输出模板要求
输出的 JSON 结构参考以下风格：
- 顶层：`type=flex`
- `altText`：简短总结，例如“设备 test_huawei_sanrui8 告警研判结果：建议观察”
- `contents`：单个 `bubble`
- `body.contents` 中通过多个 `box` + `text` 组织信息

## 业务优先级规则
1. 同类信息重复时，以最终决策结果优先
2. 其次参考 agent_log 中的 summary / observation / thought
3. 忽略所有展示性 HTML
4. 如果最终动作明确，则必须在卡片中突出展示
5. 如果出现“持续观察”“待复核”“自动恢复”“72小时无关联告警”等信号，必须保留

## 输出目标
请直接输出一个完整合法的 LINE Flex Message JSON 对象。
```

- 不建议把原始 SSE 直接暴露给 LangChain agent

### Tool 4: `create_work_order`

用途：

- 结合当前告警与分析结果，创建工单

后端接口：

- `POST http://192.168.100.225:8088/v1/workflows/run`

当前接入方式：

- Dify Workflow API

输入建议：

```json
{
  "tenant_id": "123456",
  "pmms_authorization": "token",
  "alarm": {
    "id": "A20260311001",
    "device_sn": "SN123456",
    "device_type": "inverter",
    "site_name": "XX PV Site",
    "alarm_category": "AlarmWorkOrder",
    "alarm_type": "ArcFail",
    "alarm_type_name": "Arc Fault",
    "fault_code": 1001
  },
  "analysis_markdown": "设备离线超过 4 小时，建议派单排查",
  "user": "langchain-agent"
}
```

Tool 内部应转换成 Dify 请求：

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
    "fault_desc": "设备离线超过 4 小时，建议派单排查",
    "site_name": "XX PV Site",
    "pmms_authorization": "token"
  },
  "response_mode": "blocking",
  "user": "langchain-agent"
}
```

输出建议：

```json
{
  "success": true,
  "workflow_run_id": "xxx",
  "work_order_id": "WO20260311008",
  "work_order_no": "GD-20260311-008",
  "title": "XX站点逆变器故障处理",
  "level": "HIGH",
  "status": "created",
  "assignee": "iRunDo",
  "acceptor": "iRunDo",
  "description": "根据告警分析自动建单",
  "start_time": "2026-03-12 11:25:38",
  "end_time": "2026-03-19 11:25:38",
  "raw": {}
}
```

## 5. 哪些步骤不建议做成后端 Tool

## 5.1 “是否派单”不要做成真实执行型 tool

你的第 3 步本质上是一个“人机确认节点”，不是真正的数据服务。

因此不建议设计成：

- `ask_if_dispatch_tool`

更推荐这样处理：

- `analyze_alarm` 返回分析结论
- agent 根据分析结果组织一句确认话术
- 将状态写入对话上下文，例如 `pending_confirmation=create_work_order`
- 等用户明确回复“是，建单”后，再调用 `create_work_order`

这样可以避免：

- agent 在没有用户确认时误建工单
- tool 语义不清，既不查数也不执行，只负责发问


## 8. 工具调用策略

## 8.1 建议的 system prompt 约束

建议给 LangChain agent 加上下面几条硬约束：

1. 当用户要求“查看告警”时，先调用 `list_alarms`
2. 当用户要求“分析某条告警”时，必须先确认或选定 `selected_alarm`
3. 当分析完成后，不能直接创建工单，必须先询问用户是否派单
4. 只有在用户明确确认后，才能调用 `create_work_order`
5. 如果缺少 `tenant_id` 或 `pmms_authorization`，禁止建单，并明确告知缺少业务上下文

## 8.3 典型对话示例

### 用户说：查看当前未处理告警

agent 行为：

1. 调用 `list_alarms(status="Untreated")`
2. 返回编号化列表
3. 引导用户指定分析对象

### 用户说：分析第 2 条告警

agent 行为：

1. 从 state 中取第 2 条告警
2. 若没有 `alarm_session_id`，先调用 `create_alarm_session`
3. 调用 `analyze_alarm`
4. 总结分析结论
5. 询问“是否创建工单”

### 用户说：是，创建工单

agent 行为：

1. 校验 `pending_confirmation == create_work_order`
2. 校验 `tenant_id` 和 `pmms_authorization` 是否存在
3. 调用 `create_work_order`
4. 返回工单编号、标题、等级、负责人、时间窗口等核心字段

## 9. 入参映射建议

## 9.1 从告警对象映射到工单 tool 入参

建议映射如下：

| 工单字段 | 来源 |
|------|------|
| `tenant_id` | 上下文透传 |
| `pmms_authorization` | 上下文透传 |
| `device_type` | `alarm.device_type`，缺省可降级为 `inverter` |
| `device_sn` | `alarm.device_sn` / `alarm.deviceSn` / `alarm.externalId` |
| `alarm_id` | `alarm.id` |
| `alarm_category` | 结合 `alarm.alarmCategory` 或按规则归一 |
| `alarm_type` | `alarm.alarmType` |
| `alarm_type_name` | `alarm.alarmTypeName` |
| `fault_code` | `alarm.alarm_code` 或等价字段 |
| `fault_desc` | `analysis_markdown` 清洗后的摘要 |
| `site_name` | `alarm.siteName` / `alarm.station_name` |

## 9.2 `fault_desc` 的生成建议

不要把超长原始 Markdown 直接塞给工单工作流。

建议先清洗成一段 100 到 400 字以内的摘要，保留：

- 告警对象
- 核心结论
- 建议动作
- 重要原因

例如：

```text
设备 INV-0001 于 2026-03-16 09:20 发生离线告警，当前状态仍未恢复。结合告警类型与持续时间，建议派单排查通信链路、电源状态和数据采集设备。
```

## 10. 错误处理建议

## 10.1 告警接口

### `list_alarms`

失败时建议统一返回：

```json
{
  "success": false,
  "error_type": "alarm_list_failed",
  "message": "Failed to fetch alarms."
}
```

### `analyze_alarm`

如果 SSE 中途失败，建议返回：

```json
{
  "success": false,
  "error_type": "alarm_analysis_failed",
  "message": "Alarm analysis stream failed.",
  "partial_analysis": "..."
}
```

## 10.2 工单接口

### 缺少业务上下文

如果缺少 `tenant_id` 或 `pmms_authorization`，直接在 tool 层拦截：

```json
{
  "success": false,
  "error_type": "missing_business_context",
  "message": "tenant_id or pmms_authorization is missing."
}
```

### Dify 返回失败

如果 Dify 返回异常，建议完整保留：

- HTTP 状态码
- 原始响应
- 解析失败信息

不要只返回“创建失败”。
