import { AlarmWorkflowState, AlarmInfo, DecisionResult } from '../types';

const createInitialState = (): AlarmWorkflowState => ({
  sessionId: null,
  alarmList: [],
  selectedAlarm: null,
  analysisResult: null,
  analysisRawText: null,
  pendingConfirmation: null,
  businessContext: {
    tenant_id: null,
    pmms_authorization: null,
  },
});

export class AlarmSessionService {
  private sessions: Map<string, AlarmWorkflowState> = new Map();

  getSession(userId: string): AlarmWorkflowState {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, createInitialState());
    }
    return this.sessions.get(userId)!;
  }

  setSessionId(userId: string, sessionId: string): void {
    const state = this.getSession(userId);
    state.sessionId = sessionId;
  }

  setAlarmList(userId: string, alarms: AlarmInfo[]): void {
    const state = this.getSession(userId);
    state.alarmList = alarms;
  }

  getAlarmByIndex(userId: string, index: number): AlarmInfo | null {
    const state = this.getSession(userId);
    if (index >= 0 && index < state.alarmList.length) {
      return state.alarmList[index];
    }
    return null;
  }

  getAlarmById(userId: string, alarmId: string): AlarmInfo | null {
    const state = this.getSession(userId);
    return state.alarmList.find(a => a.id === alarmId) || null;
  }

  selectAlarm(userId: string, alarmId: string): AlarmInfo | null {
    const state = this.getSession(userId);
    const alarm = this.getAlarmById(userId, alarmId);
    if (alarm) {
      state.selectedAlarm = alarm;
    }
    return alarm;
  }

  setSelectedAlarm(userId: string, alarm: AlarmInfo): void {
    const state = this.getSession(userId);
    state.selectedAlarm = alarm;
  }

  setAnalysisResult(userId: string, results: DecisionResult[], rawText: string): void {
    const state = this.getSession(userId);
    state.analysisResult = results;
    state.analysisRawText = rawText;
  }

  getAnalysisResult(userId: string): { results: DecisionResult[] | null; rawText: string | null } {
    const state = this.getSession(userId);
    return {
      results: state.analysisResult,
      rawText: state.analysisRawText,
    };
  }

  setPendingConfirmation(userId: string, type: 'create_work_order'): void {
    const state = this.getSession(userId);
    state.pendingConfirmation = type;
  }

  clearPendingConfirmation(userId: string): void {
    const state = this.getSession(userId);
    state.pendingConfirmation = null;
  }

  getPendingConfirmation(userId: string): 'create_work_order' | null {
    const state = this.getSession(userId);
    return state.pendingConfirmation;
  }

  setBusinessContext(userId: string, tenantId: string, authorization: string): void {
    const state = this.getSession(userId);
    state.businessContext.tenant_id = tenantId;
    state.businessContext.pmms_authorization = authorization;
  }

  getBusinessContext(userId: string): { tenant_id: string | null; pmms_authorization: string | null } {
    const state = this.getSession(userId);
    return state.businessContext;
  }

  hasBusinessContext(userId: string): boolean {
    const state = this.getSession(userId);
    return !!(state.businessContext.tenant_id && state.businessContext.pmms_authorization);
  }

  clearSession(userId: string): void {
    this.sessions.delete(userId);
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getSelectedAlarm(userId: string): AlarmInfo | null {
    const state = this.getSession(userId);
    return state.selectedAlarm;
  }
}

export const alarmSessionService = new AlarmSessionService();
