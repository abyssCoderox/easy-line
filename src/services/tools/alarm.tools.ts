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
    const toolName = 'create_alarm_session';
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      userId: currentUserId.substring(0, 8) + '...',
      input: '{}',
    });

    if (!alarmConfig.apiBaseUrl) {
      const output = {
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: '告警服务未配置，请联系管理员配置 ALARM_API_BASE_URL',
      };
      logger.warn('ALARM', `[${toolName}] API URL not configured`);
      logger.debug('ALARM', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output);
    }

    try {
      const url = `${alarmConfig.apiBaseUrl}/api/v1/new_session`;
      
      logger.debug('ALARM', `[${toolName}] Calling API`, {
        url,
        method: 'POST',
      });

      const response = await axios.post(
        url,
        {},
        { timeout: alarmConfig.apiTimeout }
      );

      const sessionId = response.data?.session_id;
      if (sessionId) {
        alarmSessionService.setSessionId(currentUserId, sessionId);
        
        const output = {
          success: true,
          session_id: sessionId,
        };
        
        logger.debug('ALARM', `[${toolName}] Output`, {
          output: JSON.stringify(output),
        });
        
        logger.info('ALARM', `[${toolName}] Session created`, { sessionId });
        return JSON.stringify(output);
      }

      const output = {
        success: false,
        error_type: AlarmErrorType.SESSION_NOT_FOUND,
        message: '创建会话失败：未返回 session_id',
      };
      logger.warn('ALARM', `[${toolName}] No session_id in response`);
      logger.debug('ALARM', `[${toolName}] Output`, {
        output: JSON.stringify(output),
        response: JSON.stringify(response.data),
      });
      return JSON.stringify(output);
    } catch (error: any) {
      logger.error('ALARM', `[${toolName}] Error`, {
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
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
    const toolName = 'list_alarms';
    const input = { status, page, page_size };
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      userId: currentUserId.substring(0, 8) + '...',
      input: JSON.stringify(input),
    });

    if (!alarmConfig.apiBaseUrl) {
      const output = {
        success: false,
        error_type: AlarmErrorType.ALARM_LIST_FAILED,
        message: '告警服务未配置，请联系管理员配置 ALARM_API_BASE_URL',
        alarms: [],
        total: 0,
        page: 1,
      };
      logger.warn('ALARM', `[${toolName}] API URL not configured`);
      logger.debug('ALARM', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output);
    }

    try {
      const url = `${alarmConfig.apiBaseUrl}/api/v1/alarms`;
      
      logger.debug('ALARM', `[${toolName}] Calling API`, {
        url,
        params: JSON.stringify(input),
      });

      const response = await axios.get(
        url,
        {
          params: input,
          timeout: alarmConfig.apiTimeout,
        }
      );

      const data = response.data?.data;
      const alarms: AlarmInfo[] = data?.alarms || [];
      const total = data?.total || 0;

      alarmSessionService.setAlarmList(currentUserId, alarms);

      const flexMessage = buildAlarmListFlexMessage(alarms, page, total);

      const output = {
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
      };

      logger.debug('ALARM', `[${toolName}] Output`, {
        alarmCount: alarms.length,
        total,
        output: JSON.stringify(output).substring(0, 500) + '...',
      });

      logger.info('ALARM', `[${toolName}] Alarms fetched`, { 
        total, 
        page, 
        userId: currentUserId.substring(0, 8) + '...' 
      });

      return JSON.stringify(output);
    } catch (error: any) {
      logger.error('ALARM', `[${toolName}] Error`, {
        input: JSON.stringify(input),
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
      });
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
    const toolName = 'analyze_alarm';
    const input = { alarm_index, language, force_reanalyze };
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      userId: currentUserId.substring(0, 8) + '...',
      input: JSON.stringify(input),
    });

    if (!alarmConfig.apiBaseUrl) {
      const output = {
        success: false,
        error_type: AlarmErrorType.ALARM_ANALYSIS_FAILED,
        message: '告警服务未配置',
      };
      logger.warn('ALARM', `[${toolName}] API URL not configured`);
      logger.debug('ALARM', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output);
    }

    const state = alarmSessionService.getSession(currentUserId);
    
    let sessionId = state.sessionId;
    if (!sessionId) {
      logger.debug('ALARM', `[${toolName}] No session, creating new one`);
      try {
        const sessionUrl = `${alarmConfig.apiBaseUrl}/api/v1/new_session`;
        logger.debug('ALARM', `[${toolName}] Creating session`, { url: sessionUrl });
        
        const sessionResponse = await axios.post(
          sessionUrl,
          {},
          { timeout: alarmConfig.apiTimeout }
        );
        sessionId = sessionResponse.data?.session_id;
        if (sessionId) {
          alarmSessionService.setSessionId(currentUserId, sessionId);
          logger.debug('ALARM', `[${toolName}] Session created`, { sessionId });
        }
      } catch (error: any) {
        logger.error('ALARM', `[${toolName}] Failed to create session`, {
          error: error.message,
        });
        return JSON.stringify({
          success: false,
          error_type: AlarmErrorType.SESSION_NOT_FOUND,
          message: `创建会话失败：${error.message}`,
        });
      }
    }

    const alarm = alarmSessionService.getAlarmByIndex(currentUserId, alarm_index - 1);
    if (!alarm) {
      const output = {
        success: false,
        error_type: AlarmErrorType.ALARM_NOT_FOUND,
        message: `未找到序号为 ${alarm_index} 的告警，请先查看告警列表`,
      };
      logger.warn('ALARM', `[${toolName}] Alarm not found`, { alarm_index });
      logger.debug('ALARM', `[${toolName}] Output`, {
        output: JSON.stringify(output),
        alarmListLength: state.alarmList.length,
      });
      return JSON.stringify(output);
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

      const url = `${alarmConfig.apiBaseUrl}/api/v1/process_alarms`;
      
      logger.debug('ALARM', `[${toolName}] Calling SSE API`, {
        url,
        sessionId,
        alarmId: alarm.id,
        requestBody: JSON.stringify(requestBody),
      });

      logger.info('ALARM', `[${toolName}] Starting alarm analysis`, { 
        alarmId: alarm.id, 
        sessionId,
        userId: currentUserId.substring(0, 8) + '...'
      });

      const result = await fetchSSE({
        url,
        method: 'POST',
        body: requestBody,
        timeout: alarmConfig.apiTimeout,
      });

      logger.debug('ALARM', `[${toolName}] SSE completed`, {
        messageCount: result.messages.length,
        decisionCount: result.decisionResults.length,
        rawTextLength: result.rawText.length,
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
        logger.debug('ALARM', `[${toolName}] Building Flex Message with LLM`);
        flexMessage = await flexMessageLLMBuilder.buildAlarmAnalysisFlexMessage(
          alarm, 
          decisionResults, 
          result.rawText
        );
        if (!flexMessage) {
          flexMessage = buildAlarmAnalysisFlexMessage(alarm, decisionResults, result.rawText);
          logger.warn('ALARM', `[${toolName}] LLM Flex Message build failed, fallback to code builder`);
        }
      } else {
        logger.debug('ALARM', `[${toolName}] Building Flex Message with code`);
        flexMessage = buildAlarmAnalysisFlexMessage(alarm, decisionResults, result.rawText);
      }

      const output = {
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
      };

      logger.debug('ALARM', `[${toolName}] Output`, {
        success: true,
        decisionCount: decisionResults.length,
        hasFlexMessage: !!flexMessage,
        output: JSON.stringify(output).substring(0, 500) + '...',
      });

      logger.info('ALARM', `[${toolName}] Analysis completed`, { 
        alarmId: alarm.id,
        decisionCount: decisionResults.length,
        flexBuilder: alarmConfig.flexMessageBuilder,
      });

      return JSON.stringify(output);
    } catch (error: any) {
      const errorType = error.message.includes('timeout') 
        ? AlarmErrorType.SSE_TIMEOUT 
        : AlarmErrorType.SSE_PARSE_ERROR;

      logger.error('ALARM', `[${toolName}] Error`, { 
        alarmId: alarm.id, 
        error: error.message,
        stack: error.stack,
        errorType,
      });
      
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
    const toolName = 'create_work_order';
    const input = { fault_desc: fault_desc.substring(0, 100) + '...' };
    
    logger.debug('WORKORDER', `[${toolName}] Input`, {
      userId: currentUserId.substring(0, 8) + '...',
      input: JSON.stringify(input),
    });

    if (!alarmConfig.difyWorkflowUrl || !alarmConfig.difyApiKey) {
      const output = {
        success: false,
        error_type: AlarmErrorType.DIFY_ERROR,
        message: '工单服务未配置，请联系管理员配置 DIFY_WORKFLOW_URL 和 DIFY_API_KEY',
      };
      logger.warn('WORKORDER', `[${toolName}] Dify not configured`);
      logger.debug('WORKORDER', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output as WorkOrderResult);
    }

    const state = alarmSessionService.getSession(currentUserId);
    const alarm = state.selectedAlarm;

    if (!alarm) {
      const output = {
        success: false,
        error_type: AlarmErrorType.ALARM_NOT_FOUND,
        message: '未找到选中的告警，请先分析告警',
      };
      logger.warn('WORKORDER', `[${toolName}] No selected alarm`);
      logger.debug('WORKORDER', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output as WorkOrderResult);
    }

    let tenantId = state.businessContext.tenant_id || alarmConfig.defaultTenantId;
    let pmmsAuthorization = state.businessContext.pmms_authorization || alarmConfig.defaultPmmsAuthorization;

    if (!tenantId || !pmmsAuthorization) {
      const output = {
        success: false,
        error_type: AlarmErrorType.MISSING_BUSINESS_CONTEXT,
        message: '缺少业务上下文（tenant_id 或 pmms_authorization），无法创建工单',
      };
      logger.warn('WORKORDER', `[${toolName}] Missing business context`, {
        hasTenantId: !!tenantId,
        hasAuth: !!pmmsAuthorization,
      });
      logger.debug('WORKORDER', `[${toolName}] Output`, {
        output: JSON.stringify(output),
      });
      return JSON.stringify(output as WorkOrderResult);
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

      const url = `${alarmConfig.difyWorkflowUrl}/v1/workflows/run`;
      
      logger.debug('WORKORDER', `[${toolName}] Calling Dify API`, {
        url,
        alarmId: alarm.id,
        tenantId,
        inputs: JSON.stringify(difyRequest.inputs),
      });

      logger.info('WORKORDER', `[${toolName}] Creating work order`, { 
        alarmId: alarm.id,
        tenantId,
        userId: currentUserId.substring(0, 8) + '...'
      });

      const response = await axios.post(
        url,
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
      
      logger.debug('WORKORDER', `[${toolName}] Dify response`, {
        workflowRunId: response.data?.workflow_run_id,
        outputs: JSON.stringify(outputs),
      });
      
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

      const output = {
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
      };

      logger.debug('WORKORDER', `[${toolName}] Output`, {
        success: true,
        workOrderNo: outputs.work_order_no,
        output: JSON.stringify(output).substring(0, 500) + '...',
      });

      logger.info('WORKORDER', `[${toolName}] Work order created`, { 
        workOrderNo: outputs.work_order_no,
        workflowRunId: response.data?.workflow_run_id,
      });

      return JSON.stringify(output as WorkOrderResult);
    } catch (error: any) {
      logger.error('WORKORDER', `[${toolName}] Error`, { 
        alarmId: alarm.id,
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        httpStatus: error.response?.status,
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
    const toolName = 'set_business_context';
    const input = { tenant_id, pmms_authorization: '***' };
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      userId: currentUserId.substring(0, 8) + '...',
      input: JSON.stringify(input),
    });

    alarmSessionService.setBusinessContext(currentUserId, tenant_id, pmms_authorization);
    
    const output = {
      success: true,
      message: '业务上下文已设置，现在可以创建工单了',
    };

    logger.debug('ALARM', `[${toolName}] Output`, {
      output: JSON.stringify(output),
    });
    
    logger.info('ALARM', `[${toolName}] Business context set`, { 
      tenantId: tenant_id,
      userId: currentUserId.substring(0, 8) + '...'
    });

    return JSON.stringify(output);
  },
});
