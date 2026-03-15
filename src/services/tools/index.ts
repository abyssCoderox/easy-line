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

export const tools: DynamicStructuredTool[] = [
  createTaskTool,
  listTasksTool,
  deleteTaskTool,
  enableTaskTool,
  disableTaskTool,
  alertQueryTool,
  deviceStatusTool,
  tavilyTool,
];

export { setTaskContext };
