export interface AlarmInfo {
  id: string;
  device_sn: string;
  deviceName?: string;
  site_name: string;
  siteName?: string;
  alarm_code: string;
  alarmType?: string;
  alarmTypeName?: string;
  alarmTime?: string;
  processing_status: 'Untreated' | 'Processing' | 'Processed';
  processingStatus?: 'Untreated' | 'Processing' | 'Processed';
  currentStatus?: string;
  created_at: string;
  raw_data?: string;
}

export interface ListAlarmsResponse {
  data: {
    alarms: AlarmInfo[];
    total: number;
    page: number;
    page_size: number;
  };
}

export interface ListAlarmsToolResult {
  success: boolean;
  total: number;
  page: number;
  alarms: AlarmInfo[];
  error?: string;
}

export interface AlarmSessionResponse {
  session_id: string;
}

export interface AnalyzeAlarmInput {
  session_id: string;
  alarm: AlarmInfo;
  mode?: 'standard' | 'quick';
  business_type?: string;
  force_reanalyze?: boolean;
  language?: 'zh' | 'en';
}

export interface SSEMessage {
  type: 'content' | 'agent_log' | 'decision_results';
  text?: string;
  log_type?: 'observation' | 'plan' | 'thought' | 'summary';
  payload?: any;
}

export interface DecisionResult {
  id: string;
  status: string;
  action: 'dispatch' | 'observe' | 'close' | 'ignore';
  level: string;
  tags: string[];
  confidence: number;
  reason: string;
}

export interface AnalyzeAlarmToolResult {
  success: boolean;
  flexMessage?: any;
  decisionResults?: DecisionResult[];
  rawAnalysis?: string;
  error?: string;
  errorType?: 'alarm_analysis_failed' | 'sse_parse_error' | 'timeout';
}

export interface WorkOrderInput {
  tenant_id: string;
  pmms_authorization: string;
  alarm: {
    id: string;
    device_sn: string;
    device_type?: string;
    site_name: string;
    alarm_category?: string;
    alarm_type?: string;
    alarm_type_name?: string;
    fault_code?: number | string;
  };
  analysis_markdown: string;
  user?: string;
}

export interface DifyWorkflowRequest {
  inputs: {
    tenant_id: string;
    device_type: string;
    device_sn: string;
    alarm_id: string;
    alarm_category: string;
    alarm_type: string;
    alarm_type_name: string;
    fault_code: number | string;
    fault_desc: string;
    site_name: string;
    pmms_authorization: string;
  };
  response_mode: 'blocking';
  user: string;
}

export interface DifyWorkflowResponse {
  workflow_run_id: string;
  outputs: {
    work_order_id?: string;
    work_order_no?: string;
    title?: string;
    level?: string;
    status?: string;
    assignee?: string;
    acceptor?: string;
    description?: string;
    start_time?: string;
    end_time?: string;
  };
}

export interface WorkOrderResult {
  success: boolean;
  workflow_run_id?: string;
  work_order_id?: string;
  work_order_no?: string;
  title?: string;
  level?: string;
  status?: string;
  assignee?: string;
  acceptor?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  error?: string;
  errorType?: 'missing_business_context' | 'dify_error' | 'validation_error';
}

export interface AlarmWorkflowState {
  sessionId: string | null;
  alarmList: AlarmInfo[];
  selectedAlarm: AlarmInfo | null;
  analysisResult: DecisionResult[] | null;
  analysisRawText: string | null;
  pendingConfirmation: 'create_work_order' | null;
  businessContext: {
    tenant_id: string | null;
    pmms_authorization: string | null;
  };
}

export enum AlarmErrorType {
  ALARM_LIST_FAILED = 'alarm_list_failed',
  ALARM_ANALYSIS_FAILED = 'alarm_analysis_failed',
  SSE_PARSE_ERROR = 'sse_parse_error',
  SSE_TIMEOUT = 'sse_timeout',
  MISSING_BUSINESS_CONTEXT = 'missing_business_context',
  DIFY_ERROR = 'dify_error',
  VALIDATION_ERROR = 'validation_error',
  SESSION_NOT_FOUND = 'session_not_found',
  ALARM_NOT_FOUND = 'alarm_not_found',
}

export interface AlarmToolError {
  success: false;
  error_type: AlarmErrorType;
  message: string;
  details?: {
    httpStatus?: number;
    originalError?: string;
    partialData?: any;
  };
}

export interface AlarmConfig {
  apiBaseUrl: string;
  apiTimeout: number;
  difyWorkflowUrl: string;
  difyApiKey: string;
  difyUser: string;
  defaultTenantId?: string;
  defaultPmmsAuthorization?: string;
  flexMessageBuilder: 'code' | 'llm';
}
