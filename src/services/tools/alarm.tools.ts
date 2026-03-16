import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { alarmConfig } from '../../config';
import { alarmSessionService } from '../alarm-session.service';
import { fetchSSE } from '../../utils/sse-client';
import { 
  buildAlarmAnalysisFlexMessage, 
  buildAlarmListFlexMessage,
  buildWorkOrderResultFlexMessage 
} from '../../utils/flex-message-builder';
import { flexMessageLLMBuilder } from '../flex-message-llm.service';
import { 
  AlarmInfo, 
  ListAlarmsToolResult, 
  DecisionResult,
  WorkOrderResult,
  AlarmErrorType 
} from '../../types';
import { logger } from '../logger.service';

let currentUserId: string = '';

export function setAlarmToolContext(userId: string) {
  currentUserId = userId;
}

export const createAlarmSessionTool = new DynamicStructuredTool({
  name: 'create_alarm_session',
  description: '创建告警分析会话。在分析告警前必须先调用此工具获取会话ID。',
  schema: z.object({}),
  func: async () => {
    if (!alarmConfig.apiBaseUrl) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: '告警服务未配置，请联系管理员配置 ALARM_API_BASE_URL',
      });
    }

    try {
      const response = await axios.post(
        `${alarmConfig.apiBaseUrl}/api/v1/new_session`,
        {},
        { timeout: alarmConfig.apiTimeout }
      );

      const sessionId = response.data?.session_id;
      if (sessionId) {
        alarmSessionService.setSessionId(currentUserId, sessionId);
        logger.info('ALARM', 'Session created', { sessionId });
        return JSON.stringify({
          success: true,
          session_id: sessionId,
        });
      }

      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.SESSION_NOT_FOUND,
        message: '创建会话失败：未返回 session_id',
      });
    } catch (error: any) {
      logger.error('ALARM', 'Failed to create session', { error: error.message });
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: `创建会话失败：${error.message}`,
      });
    }
  },
});

export const listAlarmsTool = new DynamicStructuredTool({
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
  }),
  func: async ({ status = '', page = 1, page_size = 20 }) => {
    if (!alarmConfig.apiBaseUrl) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: '告警服务未配置，请联系管理员配置 ALARM_API_BASE_URL',
        alarms: [],
        total: 0,
        page: 1,
      });
    }

    try {
      const response = await axios.get(
        `${alarmConfig.apiBaseUrl}/api/v1/alarms`,
        {
          params: { status, page, page_size },
          timeout: alarmConfig.apiTimeout,
        }
      );

      const data = response.data?.data;
      const alarms: AlarmInfo[] = data?.alarms || [];
      const total = data?.total || 0;

      alarmSessionService.setAlarmList(currentUserId, alarms);

      const flexMessage = buildAlarmListFlexMessage(alarms, page, total);

      logger.info('ALARM', 'Alarm list fetched', { 
        total, 
        page, 
        userId: currentUserId.substring(0, 8) + '...' 
      });

      return JSON.stringify({
        success: true,
        total,
        page,
        alarms: alarms.map((a, i) => ({
          index: i + 1,
          id: a.id,
          device: a.deviceName || a.device_sn,
          site: a.siteName || a.site_name,
          type: a.alarmTypeName || a.alarmType || a.alarm_code,
          status: a.processing_status || a.processingStatus,
          time: a.alarmTime || a.created_at,
        })),
        flexMessage,
      });
    } catch (error: any) {
      logger.error('ALARM', 'Failed to fetch alarms', { error: error.message });
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: `获取告警列表失败：${error.message}`,
        alarms: [],
        total: 0,
        page: 1,
      });
    }
  },
});

export const analyzeAlarmTool = new DynamicStructuredTool({
  name: 'analyze_alarm',
  description: '分析指定告警。当用户要求分析告警、研判告警、诊断告警时使用。需要先调用create_alarm_session获取会话ID。',
  schema: z.object({
    alarm_index: z.number().min(1)
      .describe('要分析的告警序号（从告警列表中的序号，从1开始）'),
    language: z.enum(['zh', 'en']).optional()
      .describe('分析结果语言，默认zh'),
    force_reanalyze: z.boolean().optional()
      .describe('是否强制重新分析，默认false'),
  }),
  func: async ({ alarm_index, language = 'zh', force_reanalyze = false }) => {
    if (!alarmConfig.apiBaseUrl) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_ANALYSIS_FAILED,
        message: '告警服务未配置',
      });
    }

    const state = alarmSessionService.getSession(currentUserId);
    
    let sessionId = state.sessionId;
    if (!sessionId) {
      try {
        const sessionResponse = await axios.post(
          `${alarmConfig.apiBaseUrl}/api/v1/new_session`,
          {},
          { timeout: alarmConfig.apiTimeout }
        );
        sessionId = sessionResponse.data?.session_id;
        if (sessionId) {
          alarmSessionService.setSessionId(currentUserId, sessionId);
        }
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error_type: AlarmErrorType.SESSION_NOT_FOUND,
          message: `创建会话失败：${error.message}`,
        });
      }
    }

    const alarm = alarmSessionService.getAlarmByIndex(currentUserId, alarm_index - 1);
    if (!alarm) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_NOT_FOUND,
        message: `未找到序号为 ${alarm_index} 的告警，请先查看告警列表`,
      });
    }

    alarmSessionService.setSelectedAlarm(currentUserId, alarm);

    try {
      const requestBody = {
        session_id: sessionId,
        alarm: {
          id: alarm.id,
          device_sn: alarm.device_sn,
          deviceName: alarm.deviceName || alarm.device_sn,
          siteName: alarm.siteName || alarm.site_name,
          alarmType: alarm.alarmType || alarm.alarm_code,
          alarmTypeName: alarm.alarmTypeName || alarm.alarmType,
          alarmTime: alarm.alarmTime || alarm.created_at,
          currentStatus: alarm.currentStatus || 'InAlarm',
          processingStatus: alarm.processing_status || alarm.processingStatus || 'Untreated',
        },
        mode: 'standard',
        business_type: 'device_alarm',
        force_reanalyze: force_reanalyze,
        language: language,
      };

      logger.info('ALARM', 'Starting alarm analysis', { 
        alarmId: alarm.id, 
        sessionId,
        userId: currentUserId.substring(0, 8) + '...'
      });

      const result = await fetchSSE({
        url: `${alarmConfig.apiBaseUrl}/api/v1/process_alarms`,
        method: 'POST',
        body: requestBody,
        timeout: alarmConfig.apiTimeout,
      });

      const decisionResults: DecisionResult[] = result.decisionResults || [];
      
      alarmSessionService.setAnalysisResult(
        currentUserId, 
        decisionResults, 
        result.rawText
      );

      if (decisionResults.length > 0) {
        alarmSessionService.setPendingConfirmation(currentUserId, 'create_work_order');
      }

      let flexMessage;
      if (alarmConfig.flexMessageBuilder === 'llm') {
        flexMessage = await flexMessageLLMBuilder.buildAlarmAnalysisFlexMessage(
          alarm, 
          decisionResults, 
          result.rawText
        );
        if (!flexMessage) {
          flexMessage = buildAlarmAnalysisFlexMessage(alarm, decisionResults, result.rawText);
          logger.warn('ALARM', 'LLM Flex Message build failed, fallback to code builder');
        }
      } else {
        flexMessage = buildAlarmAnalysisFlexMessage(alarm, decisionResults, result.rawText);
      }

      logger.info('ALARM', 'Alarm analysis completed', { 
        alarmId: alarm.id,
        decisionCount: decisionResults.length,
        flexBuilder: alarmConfig.flexMessageBuilder,
      });

      return JSON.stringify({
        success: true,
        flexMessage,
        decisionResults: decisionResults.map(d => ({
          action: d.action,
          level: d.level,
          confidence: d.confidence,
          reason: d.reason?.substring(0, 200),
        })),
        rawAnalysis: result.rawText?.substring(0, 500),
        pendingConfirmation: decisionResults.length > 0 ? 'create_work_order' : null,
      });
    } catch (error: any) {
      logger.error('ALARM', 'Alarm analysis failed', { 
        alarmId: alarm.id, 
        error: error.message 
      });
      
      const errorType = error.message.includes('timeout') 
        ? AlarmErrorType.SSE_TIMEOUT 
        : AlarmErrorType.SSE_PARSE_ERROR;

      return JSON.stringify({
        success: false,
        error_type: errorType,
        message: `告警分析失败：${error.message}`,
        alarmId: alarm.id,
      });
    }
  },
});

export const createWorkOrderTool = new DynamicStructuredTool({
  name: 'create_work_order',
  description: '创建工单。在告警分析完成后，用户确认派单时调用。需要tenant_id和pmms_authorization。',
  schema: z.object({
    fault_desc: z.string()
      .describe('故障描述摘要，100-400字'),
  }),
  func: async ({ fault_desc }) => {
    if (!alarmConfig.difyWorkflowUrl || !alarmConfig.difyApiKey) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.DIFY_ERROR,
        message: '工单服务未配置，请联系管理员配置 DIFY_WORKFLOW_URL 和 DIFY_API_KEY',
      } as WorkOrderResult);
    }

    const state = alarmSessionService.getSession(currentUserId);
    const alarm = state.selectedAlarm;

    if (!alarm) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.ALARM_NOT_FOUND,
        message: '未找到选中的告警，请先分析告警',
      } as WorkOrderResult);
    }

    let tenantId = state.businessContext.tenant_id || alarmConfig.defaultTenantId;
    let pmmsAuthorization = state.businessContext.pmms_authorization || alarmConfig.defaultPmmsAuthorization;

    if (!tenantId || !pmmsAuthorization) {
      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.MISSING_BUSINESS_CONTEXT,
        message: '缺少业务上下文（tenant_id 或 pmms_authorization），无法创建工单',
      } as WorkOrderResult);
    }

    try {
      const difyRequest = {
        inputs: {
          tenant_id: tenantId,
          device_type: 'inverter',
          device_sn: alarm.device_sn,
          alarm_id: String(alarm.id),
          alarm_category: 'AlarmWorkOrder',
          alarm_type: alarm.alarmType || alarm.alarm_code,
          alarm_type_name: alarm.alarmTypeName || alarm.alarmType || '未知告警',
          fault_code: alarm.alarm_code,
          fault_desc: fault_desc,
          site_name: alarm.siteName || alarm.site_name,
          pmms_authorization: pmmsAuthorization,
        },
        response_mode: 'blocking' as const,
        user: alarmConfig.difyUser,
      };

      logger.info('WORKORDER', 'Creating work order', { 
        alarmId: alarm.id,
        tenantId,
        userId: currentUserId.substring(0, 8) + '...'
      });

      const response = await axios.post(
        `${alarmConfig.difyWorkflowUrl}/v1/workflows/run`,
        difyRequest,
        {
          headers: {
            'Authorization': `Bearer ${alarmConfig.difyApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const outputs = response.data?.outputs || {};
      
      alarmSessionService.clearPendingConfirmation(currentUserId);

      const flexMessage = buildWorkOrderResultFlexMessage({
        work_order_no: outputs.work_order_no,
        title: outputs.title,
        level: outputs.level,
        assignee: outputs.assignee,
        start_time: outputs.start_time,
        end_time: outputs.end_time,
        description: outputs.description,
      });

      logger.info('WORKORDER', 'Work order created', { 
        workOrderNo: outputs.work_order_no,
        workflowRunId: response.data?.workflow_run_id,
      });

      return JSON.stringify({
        success: true,
        workflow_run_id: response.data?.workflow_run_id,
        work_order_id: outputs.work_order_id,
        work_order_no: outputs.work_order_no,
        title: outputs.title,
        level: outputs.level,
        status: outputs.status,
        assignee: outputs.assignee,
        acceptor: outputs.acceptor,
        description: outputs.description,
        start_time: outputs.start_time,
        end_time: outputs.end_time,
        flexMessage,
      } as WorkOrderResult);
    } catch (error: any) {
      logger.error('WORKORDER', 'Failed to create work order', { 
        alarmId: alarm.id,
        error: error.message,
        response: error.response?.data,
      });

      return JSON.stringify({
        success: false,
        error_type: AlarmErrorType.DIFY_ERROR,
        message: `工单创建失败：${error.response?.data?.message || error.message}`,
        details: {
          httpStatus: error.response?.status,
          originalError: error.message,
        },
      } as WorkOrderResult);
    }
  },
});

export const setBusinessContextTool = new DynamicStructuredTool({
  name: 'set_business_context',
  description: '设置业务上下文。在创建工单前需要设置tenant_id和pmms_authorization。',
  schema: z.object({
    tenant_id: z.string().describe('租户ID'),
    pmms_authorization: z.string().describe('PMMS授权Token'),
  }),
  func: async ({ tenant_id, pmms_authorization }) => {
    alarmSessionService.setBusinessContext(currentUserId, tenant_id, pmms_authorization);
    
    logger.info('ALARM', 'Business context set', { 
      tenantId: tenant_id,
      userId: currentUserId.substring(0, 8) + '...'
    });

    return JSON.stringify({
      success: true,
      message: '业务上下文已设置，现在可以创建工单了',
    });
  },
});
