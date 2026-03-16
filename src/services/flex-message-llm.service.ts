import { ChatOpenAI } from '@langchain/openai';
import { config } from '../config';
import { AlarmInfo, DecisionResult } from '../types';
import { logger } from './logger.service';

const FLEX_MESSAGE_PROMPT = `你是一个"LINE Flex Message 告警卡片生成助手"。

我会给你一段由多行 \`data: ...\` 组成的流式消息，内容可能包含：
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
   - \`type: "flex"\`
   - \`altText\`
   - \`contents\`
7. 如果只有 1 条告警，\`contents\` 使用 \`bubble\`
8. 如果有多条告警，\`contents\` 使用 \`carousel\`
9. 不要输出 HTML 标签
10. 不要输出按钮"修改 / 保存 / 取消 / 重新研判"等前端编辑控件
11. 信息缺失时不要编造，缺失字段可以省略或写"未提及"
12. 所有较长文本必须加 \`wrap: true\`

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

- header：显示标题，如"告警研判结果"
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
- 长文本必须 \`wrap: true\`
- 不使用复杂 hero 视频
- 尽量避免过深层级嵌套

## 业务优先级规则
1. 同类信息重复时，以最终决策结果优先
2. 其次参考 agent_log 中的 summary / observation / thought
3. 忽略所有展示性 HTML
4. 如果最终动作明确，则必须在卡片中突出展示
5. 如果出现"持续观察""待复核""自动恢复""72小时无关联告警"等信号，必须保留

## 输出目标
请直接输出一个完整合法的 LINE Flex Message JSON 对象。`;

export class FlexMessageLLMBuilder {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      model: config.llm.model,
      temperature: 0.1,
      apiKey: config.llm.apiKey,
      timeout: 30000,
      configuration: config.llm.apiBaseUrl ? {
        baseURL: config.llm.apiBaseUrl,
      } : undefined,
    });
  }

  async buildAlarmAnalysisFlexMessage(
    alarm: AlarmInfo,
    decisionResults: DecisionResult[],
    rawAnalysis: string
  ): Promise<any> {
    const deviceName = alarm.deviceName || alarm.device_sn || '未知设备';
    const siteName = alarm.siteName || alarm.site_name || '未知站点';

    const prompt = `${FLEX_MESSAGE_PROMPT}

## 告警基本信息
- 设备名称：${deviceName}
- 电站名称：${siteName}
- 告警类型：${alarm.alarmTypeName || alarm.alarmType || alarm.alarm_code || '未知'}
- 告警时间：${alarm.alarmTime || alarm.created_at}

## 决策结果（如有）
${decisionResults.length > 0 ? JSON.stringify(decisionResults, null, 2) : '无结构化决策结果'}

## 原始分析流式消息
${rawAnalysis}

请生成 Flex Message JSON：`;

    try {
      const response = await this.model.invoke(prompt);
      const content = response.content as string;
      
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const flexMessage = JSON.parse(jsonStr);

      logger.info('ALARM', 'Flex Message built by LLM', {
        device: deviceName,
        hasDecision: decisionResults.length > 0,
      });

      return flexMessage;
    } catch (error: any) {
      logger.error('ALARM', 'LLM Flex Message build failed', {
        error: error.message,
      });
      
      return null;
    }
  }

  async buildWorkOrderResultFlexMessage(result: {
    work_order_no?: string;
    title?: string;
    level?: string;
    assignee?: string;
    start_time?: string;
    end_time?: string;
    description?: string;
  }): Promise<any> {
    const prompt = `生成一个工单创建成功的 LINE Flex Message JSON。

工单信息：
- 工单编号：${result.work_order_no || '未生成'}
- 标题：${result.title || '工单已创建'}
- 优先级：${result.level || '普通'}
- 负责人：${result.assignee || '待分配'}
- 开始时间：${result.start_time || ''}
- 截止时间：${result.end_time || ''}
- 描述：${result.description || ''}

要求：
1. 只输出 JSON，不要输出其他内容
2. 使用 bubble 结构
3. header 显示"工单创建成功"，背景绿色
4. body 显示工单详情
5. 关键信息加粗突出`;

    try {
      const response = await this.model.invoke(prompt);
      const content = response.content as string;
      
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      return JSON.parse(jsonStr);
    } catch (error: any) {
      logger.error('WORKORDER', 'LLM WorkOrder Flex Message build failed', {
        error: error.message,
      });
      
      return null;
    }
  }

  async buildAlarmListFlexMessage(alarms: AlarmInfo[], page: number, total: number): Promise<any> {
    const alarmList = alarms.slice(0, 10).map((a, i) => ({
      index: i + 1,
      device: a.deviceName || a.device_sn,
      site: a.siteName || a.site_name,
      type: a.alarmTypeName || a.alarmType || a.alarm_code,
      status: a.processing_status || a.processingStatus,
    }));

    const prompt = `生成一个告警列表的 LINE Flex Message JSON。

告警列表（第${page}页，共${total}条）：
${JSON.stringify(alarmList, null, 2)}

要求：
1. 只输出 JSON，不要输出其他内容
2. 使用 bubble 结构
3. header 显示"告警列表"，背景红色
4. body 显示告警列表，每条显示序号、设备、告警类型
5. 未处理状态用🔴，处理中用🟡，已处理用🟢
6. 如果告警超过10条，底部显示"...还有X条告警"`;

    try {
      const response = await this.model.invoke(prompt);
      const content = response.content as string;
      
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      return JSON.parse(jsonStr);
    } catch (error: any) {
      logger.error('ALARM', 'LLM Alarm List Flex Message build failed', {
        error: error.message,
      });
      
      return null;
    }
  }
}

export const flexMessageLLMBuilder = new FlexMessageLLMBuilder();
