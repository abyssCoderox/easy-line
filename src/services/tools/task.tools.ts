import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { taskManagerService } from '../task-manager.service';

let currentUserId: string = '';

export function setTaskContext(userId: string) {
  currentUserId = userId;
}

export const createTaskTool = new DynamicStructuredTool({
  name: 'create_task',
  description: '创建定时任务。当用户想设置提醒、定时通知、定时推送时使用此工具。支持自然语言时间描述如"每天早上9点"、"每周一10点"等。',
  schema: z.object({
    schedule: z.string().describe('时间表达式，可以是Cron格式如"0 9 * * *"或自然语言如"每天早上9点"'),
    taskName: z.string().optional().describe('任务名称，如"开会提醒"、"吃药提醒"'),
  }),
  func: async ({ schedule, taskName }) => {
    try {
      const result = await taskManagerService.createTaskFromNaturalLanguage(
        currentUserId,
        schedule,
        undefined,
        taskName
      );
      
      return JSON.stringify({
        success: result.success,
        message: result.message,
        taskId: result.taskId,
        schedule: result.schedule,
        nextExecuteTime: result.nextExecuteTime,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const listTasksTool = new DynamicStructuredTool({
  name: 'list_tasks',
  description: '查看用户的定时任务列表。当用户想查看任务、查看提醒、我的任务时使用。',
  schema: z.object({}),
  func: async () => {
    try {
      const tasks = taskManagerService.getUserTasks(currentUserId);
      
      if (tasks.length === 0) {
        return JSON.stringify({ success: true, message: '您还没有创建任何定时任务。', tasks: [] });
      }
      
      const taskList = tasks.map((task, index) => ({
        index: index + 1,
        taskId: task.taskId,
        taskName: task.taskName,
        schedule: task.schedule,
        enabled: task.enabled,
        nextExecuteTime: task.nextExecuteTime,
      }));
      
      return JSON.stringify({
        success: true,
        message: `您有 ${tasks.length} 个定时任务`,
        tasks: taskList,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const deleteTaskTool = new DynamicStructuredTool({
  name: 'delete_task',
  description: '删除定时任务。当用户想删除任务、取消提醒时使用。需要提供任务ID。',
  schema: z.object({
    taskId: z.string().describe('要删除的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.deleteTask(currentUserId, taskId);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const enableTaskTool = new DynamicStructuredTool({
  name: 'enable_task',
  description: '启用定时任务。当用户想启用任务、开启提醒时使用。',
  schema: z.object({
    taskId: z.string().describe('要启用的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.updateTaskStatus(currentUserId, taskId, true);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});

export const disableTaskTool = new DynamicStructuredTool({
  name: 'disable_task',
  description: '禁用定时任务。当用户想禁用任务、暂停提醒时使用。',
  schema: z.object({
    taskId: z.string().describe('要禁用的任务ID'),
  }),
  func: async ({ taskId }) => {
    try {
      const result = taskManagerService.updateTaskStatus(currentUserId, taskId, false);
      return JSON.stringify({
        success: result.success,
        message: result.message,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
});
