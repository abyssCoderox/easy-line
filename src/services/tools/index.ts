import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  setTaskContext,
} from './task.tools';
import { alertQueryTool } from './alert.tool';
import { deviceStatusTool } from './device.tool';
import { tavilyTool } from './tavily.tool';
import {
  createAlarmSessionTool,
  listAlarmsTool,
  analyzeAlarmTool,
  createWorkOrderTool,
  setBusinessContextTool,
  setAlarmToolContext,
} from './alarm.tools';

export const tools: DynamicStructuredTool[] = [
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  alertQueryTool,
  deviceStatusTool,
  tavilyTool,
  createAlarmSessionTool,
  listAlarmsTool,
  analyzeAlarmTool,
  createWorkOrderTool,
  setBusinessContextTool,
];

export { setTaskContext, setAlarmToolContext };
