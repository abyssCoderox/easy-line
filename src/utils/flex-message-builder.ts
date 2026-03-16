import { DecisionResult, AlarmInfo } from '../types';

interface FlexBox {
  type: 'box';
  layout: 'vertical' | 'horizontal' | 'baseline';
  contents: any[];
  spacing?: string;
  margin?: string;
  paddingAll?: string;
  backgroundColor?: string;
  cornerRadius?: string;
}

interface FlexText {
  type: 'text';
  text: string;
  weight?: 'regular' | 'bold';
  size?: string;
  color?: string;
  wrap?: boolean;
  margin?: string;
}

interface FlexSeparator {
  type: 'separator';
  margin?: string;
}

interface FlexBubble {
  type: 'bubble';
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
  styles?: {
    header?: { backgroundColor?: string };
    body?: { backgroundColor?: string };
    footer?: { backgroundColor?: string };
  };
}

interface FlexMessage {
  type: 'flex';
  altText: string;
  contents: FlexBubble;
}

function createText(text: string, options: Partial<FlexText> = {}): FlexText {
  return {
    type: 'text',
    text,
    wrap: true,
    ...options,
  };
}

function createBox(layout: 'vertical' | 'horizontal' | 'baseline', contents: any[], options: Partial<FlexBox> = {}): FlexBox {
  return {
    type: 'box',
    layout,
    contents,
    ...options,
  };
}

function createSeparator(margin?: string): FlexSeparator {
  return {
    type: 'separator',
    ...(margin ? { margin } : {}),
  };
}

function getActionColor(action: string): string {
  switch (action) {
    case 'dispatch':
      return '#FF6B6B';
    case 'observe':
      return '#4ECDC4';
    case 'close':
      return '#95E1D3';
    case 'ignore':
      return '#A0A0A0';
    default:
      return '#666666';
  }
}

function getActionText(action: string): string {
  switch (action) {
    case 'dispatch':
      return '派单处理';
    case 'observe':
      return '持续观察';
    case 'close':
      return '关闭告警';
    case 'ignore':
      return '忽略告警';
    default:
      return action;
  }
}

function getLevelColor(level: string): string {
  const levelLower = level.toLowerCase();
  if (levelLower.includes('critical') || levelLower.includes('high') || levelLower.includes('urgent')) {
    return '#FF4757';
  }
  if (levelLower.includes('secondary') || levelLower.includes('medium') || levelLower.includes('warning')) {
    return '#FFA502';
  }
  return '#2ED573';
}

export function buildAlarmAnalysisFlexMessage(
  alarm: AlarmInfo,
  decisionResults: DecisionResult[],
  rawAnalysis?: string
): FlexMessage {
  const decision = decisionResults[0];
  const deviceName = alarm.deviceName || alarm.device_sn || '未知设备';
  const siteName = alarm.siteName || alarm.site_name || '未知站点';
  const alarmTypeName = alarm.alarmTypeName || alarm.alarmType || alarm.alarm_code || '未知告警';

  const bodyContents: any[] = [];

  bodyContents.push(
    createBox('horizontal', [
      createText('告警对象', { weight: 'bold', size: 'sm', color: '#888888' }),
    ], { margin: 'md' })
  );

  bodyContents.push(
    createBox('vertical', [
      createText(`设备：${deviceName}`, { size: 'md', margin: 'sm' }),
      createText(`电站：${siteName}`, { size: 'md', margin: 'sm' }),
      createText(`告警类型：${alarmTypeName}`, { size: 'md', margin: 'sm' }),
      createText(`告警时间：${alarm.alarmTime || alarm.created_at}`, { size: 'sm', color: '#888888', margin: 'sm' }),
    ], { margin: 'md', spacing: 'xs' })
  );

  bodyContents.push(createSeparator('lg'));

  if (decision) {
    const actionColor = getActionColor(decision.action);
    const actionText = getActionText(decision.action);
    const levelColor = getLevelColor(decision.level);

    bodyContents.push(
      createBox('horizontal', [
        createText('研判结论', { weight: 'bold', size: 'sm', color: '#888888' }),
      ], { margin: 'md' })
    );

    bodyContents.push(
      createBox('vertical', [
        createText(actionText, { 
          weight: 'bold', 
          size: 'xl', 
          color: actionColor,
          margin: 'sm'
        }),
        createBox('horizontal', [
          createText(`等级：${decision.level}`, { size: 'sm', color: levelColor }),
          createText(`置信度：${decision.confidence}%`, { size: 'sm', color: '#888888', margin: 'xl' }),
        ], { margin: 'sm', spacing: 'md' }),
      ], { margin: 'md' })
    );

    if (decision.reason) {
      bodyContents.push(
        createBox('vertical', [
          createText('研判理由', { weight: 'bold', size: 'sm', color: '#888888', margin: 'md' }),
          createText(decision.reason, { size: 'sm', wrap: true, margin: 'sm' }),
        ], { margin: 'md' })
      );
    }

    if (decision.tags && decision.tags.length > 0) {
      bodyContents.push(
        createBox('vertical', [
          createText('标签', { weight: 'bold', size: 'sm', color: '#888888', margin: 'md' }),
          createText(decision.tags.join(' | '), { size: 'xs', color: '#666666', margin: 'sm' }),
        ], { margin: 'md' })
      );
    }
  } else if (rawAnalysis) {
    const summary = extractSummaryFromRawAnalysis(rawAnalysis);
    bodyContents.push(
      createBox('vertical', [
        createText('分析摘要', { weight: 'bold', size: 'sm', color: '#888888', margin: 'md' }),
        createText(summary, { size: 'sm', wrap: true, margin: 'sm' }),
      ], { margin: 'md' })
    );
  }

  const altText = decision
    ? `设备 ${deviceName} 告警研判结果：${getActionText(decision.action)}`
    : `设备 ${deviceName} 告警分析结果`;

  return {
    type: 'flex',
    altText,
    contents: {
      type: 'bubble',
      header: createBox('vertical', [
        createText('告警研判结果', { weight: 'bold', size: 'lg', color: '#FFFFFF' }),
      ], { paddingAll: '20px', backgroundColor: '#2C3E50' }),
      body: createBox('vertical', bodyContents, { paddingAll: '20px' }),
    },
  };
}

function extractSummaryFromRawAnalysis(rawAnalysis: string): string {
  const lines = rawAnalysis.split('\n');
  const contentLines: string[] = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = line.slice(6).trim();
        const parsed = JSON.parse(data);
        if (parsed.type === 'content' && parsed.text) {
          contentLines.push(parsed.text);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const summary = contentLines.join(' ').replace(/\s+/g, ' ').trim();
  if (summary.length > 300) {
    return summary.substring(0, 300) + '...';
  }
  return summary || '分析结果解析失败，请查看原始数据。';
}

export function buildWorkOrderResultFlexMessage(result: {
  work_order_no?: string;
  title?: string;
  level?: string;
  assignee?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}): FlexMessage {
  const bodyContents: any[] = [];

  if (result.work_order_no) {
    bodyContents.push(
      createBox('vertical', [
        createText('工单编号', { weight: 'bold', size: 'sm', color: '#888888' }),
        createText(result.work_order_no, { weight: 'bold', size: 'lg', margin: 'sm' }),
      ], { margin: 'md' })
    );
  }

  if (result.title) {
    bodyContents.push(
      createBox('vertical', [
        createText('工单标题', { weight: 'bold', size: 'sm', color: '#888888', margin: 'md' }),
        createText(result.title, { size: 'md', wrap: true, margin: 'sm' }),
      ], { margin: 'md' })
    );
  }

  bodyContents.push(createSeparator('lg'));

  const infoItems: any[] = [];
  
  if (result.level) {
    infoItems.push(createText(`优先级：${result.level}`, { size: 'sm', margin: 'sm' }));
  }
  if (result.assignee) {
    infoItems.push(createText(`负责人：${result.assignee}`, { size: 'sm', margin: 'sm' }));
  }
  if (result.start_time) {
    infoItems.push(createText(`开始时间：${result.start_time}`, { size: 'sm', margin: 'sm' }));
  }
  if (result.end_time) {
    infoItems.push(createText(`截止时间：${result.end_time}`, { size: 'sm', margin: 'sm' }));
  }

  if (infoItems.length > 0) {
    bodyContents.push(createBox('vertical', infoItems, { margin: 'md', spacing: 'xs' }));
  }

  if (result.description) {
    bodyContents.push(createSeparator('lg'));
    bodyContents.push(
      createBox('vertical', [
        createText('工单描述', { weight: 'bold', size: 'sm', color: '#888888', margin: 'md' }),
        createText(result.description, { size: 'sm', wrap: true, margin: 'sm' }),
      ], { margin: 'md' })
    );
  }

  return {
    type: 'flex',
    altText: `工单创建成功：${result.work_order_no || ''}`,
    contents: {
      type: 'bubble',
      header: createBox('vertical', [
        createText('工单创建成功', { weight: 'bold', size: 'lg', color: '#FFFFFF' }),
      ], { paddingAll: '20px', backgroundColor: '#27AE60' }),
      body: createBox('vertical', bodyContents, { paddingAll: '20px' }),
    },
  };
}

export function buildAlarmListFlexMessage(alarms: AlarmInfo[], page: number, total: number): FlexMessage {
  const bodyContents: any[] = [];

  bodyContents.push(
    createBox('horizontal', [
      createText(`告警列表 (第${page}页，共${total}条)`, { 
        weight: 'bold', 
        size: 'md',
      }),
    ], { margin: 'md' })
  );

  bodyContents.push(createSeparator('md'));

  const maxDisplay = 10;
  const displayAlarms = alarms.slice(0, maxDisplay);

  for (let i = 0; i < displayAlarms.length; i++) {
    const alarm = displayAlarms[i];
    const deviceName = alarm.deviceName || alarm.device_sn || '未知设备';
    const alarmTypeName = alarm.alarmTypeName || alarm.alarmType || alarm.alarm_code || '未知告警';
    
    const statusEmoji = alarm.processing_status === 'Untreated' ? '🔴' : 
                        alarm.processing_status === 'Processing' ? '🟡' : '🟢';

    bodyContents.push(
      createBox('vertical', [
        createBox('horizontal', [
          createText(`${i + 1}. ${deviceName}`, { weight: 'bold', size: 'sm' }),
          createText(statusEmoji, { size: 'sm' }),
        ], { spacing: 'sm' }),
        createText(`${alarmTypeName} | ${alarm.siteName || alarm.site_name}`, { 
          size: 'xs', 
          color: '#888888',
          margin: 'xs'
        }),
      ], { margin: 'md', spacing: 'xs' })
    );

    if (i < displayAlarms.length - 1) {
      bodyContents.push(createSeparator('sm'));
    }
  }

  if (alarms.length > maxDisplay) {
    bodyContents.push(
      createText(`... 还有 ${alarms.length - maxDisplay} 条告警`, { 
        size: 'xs', 
        color: '#888888',
        margin: 'md'
      })
    );
  }

  return {
    type: 'flex',
    altText: `当前有 ${total} 条告警`,
    contents: {
      type: 'bubble',
      header: createBox('vertical', [
        createText('告警列表', { weight: 'bold', size: 'lg', color: '#FFFFFF' }),
      ], { paddingAll: '20px', backgroundColor: '#E74C3C' }),
      body: createBox('vertical', bodyContents, { paddingAll: '20px' }),
    },
  };
}
