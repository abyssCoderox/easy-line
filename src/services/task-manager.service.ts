import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  UserTaskConfig,
  TaskCreateRequest,
  TaskCreateResponse,
  CommandParseResult,
  TaskLimitConfig,
} from '../types';
import { parseCommand, isCommand, getHelpMessage } from '../utils/command-parser';
import {
  validateCronExpression,
  getCronDescription,
  calculateNextExecuteTime,
  naturalLanguageToCron,
} from '../utils/cron-utils';
import { lineService } from './line.service';
import { logger } from './logger.service';
import { llmService } from './llm.service';

const DEFAULT_LIMIT_CONFIG: TaskLimitConfig = {
  maxTasksPerUser: 10,
  minScheduleInterval: 1,
};

const TASKS_DATA_FILE = path.join(process.cwd(), 'data', 'tasks.json');

interface PersistedTasksData {
  version: number;
  updatedAt: string;
  userTasks: Array<{
    userId: string;
    tasks: UserTaskConfig[];
  }>;
}

export class TaskManagerService {
  private userTasks: Map<string, UserTaskConfig[]> = new Map();
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private limitConfig: TaskLimitConfig;

  constructor(limitConfig: TaskLimitConfig = DEFAULT_LIMIT_CONFIG) {
    this.limitConfig = limitConfig;
    this.loadTasks();
  }

  private loadTasks(): void {
    try {
      const dataDir = path.dirname(TASKS_DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (!fs.existsSync(TASKS_DATA_FILE)) {
        return;
      }

      const data = fs.readFileSync(TASKS_DATA_FILE, 'utf-8');
      const parsed: PersistedTasksData = JSON.parse(data);

      if (parsed.userTasks && Array.isArray(parsed.userTasks)) {
        for (const userTask of parsed.userTasks) {
          const tasks = userTask.tasks.map(task => ({
            ...task,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
            lastExecuteTime: task.lastExecuteTime ? new Date(task.lastExecuteTime) : undefined,
            nextExecuteTime: task.nextExecuteTime ? new Date(task.nextExecuteTime) : undefined,
          }));
          this.userTasks.set(userTask.userId, tasks);

          for (const task of tasks) {
            if (task.enabled) {
              const scheduledTask = cron.schedule(task.schedule, () => {
                this.executeTask(task.taskId);
              });
              this.scheduledTasks.set(task.taskId, scheduledTask);
            }
          }
        }
      }

      logger.info('TaskManager', 'Tasks loaded from disk', {
        totalTasks: this.getStats().totalTasks,
      });
    } catch (error: any) {
      logger.error('TaskManager', 'Failed to load tasks', { error: error.message });
    }
  }

  private persistTasks(): void {
    try {
      const dataDir = path.dirname(TASKS_DATA_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data: PersistedTasksData = {
        version: 1,
        updatedAt: new Date().toISOString(),
        userTasks: [],
      };

      for (const [userId, tasks] of this.userTasks.entries()) {
        data.userTasks.push({ userId, tasks });
      }

      fs.writeFileSync(TASKS_DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error: any) {
      logger.error('TaskManager', 'Failed to persist tasks', { error: error.message });
    }
  }

  async processInput(userId: string, input: string): Promise<TaskCreateResponse> {
    if (isCommand(input)) {
      return this.handleCommand(userId, input);
    }
    
    return {
      success: false,
      message: '请使用命令格式或自然语言创建任务。输入 /task help 查看帮助。',
    };
  }

  async handleCommand(userId: string, input: string): Promise<TaskCreateResponse> {
    const parseResult = parseCommand(input);
    
    if (parseResult.error) {
      return { success: false, message: parseResult.error };
    }
    
    switch (parseResult.command) {
      case 'create':
        return this.createTaskFromCommand(userId, parseResult);
      case 'list':
        return this.listTasks(userId);
      case 'delete':
        return this.deleteTask(userId, parseResult.params.taskId!);
      case 'enable':
        return this.updateTaskStatus(userId, parseResult.params.taskId!, true);
      case 'disable':
        return this.updateTaskStatus(userId, parseResult.params.taskId!, false);
      case 'help':
        return { success: true, message: getHelpMessage() };
      default:
        return { success: false, message: '未知命令。输入 /task help 查看帮助。' };
    }
  }

  async createTaskFromNaturalLanguage(
    userId: string,
    schedule: string,
    scheduleDescription?: string,
    taskName?: string
  ): Promise<TaskCreateResponse> {
    const cronResult = naturalLanguageToCron(schedule);
    
    if (!cronResult) {
      if (!validateCronExpression(schedule)) {
        return {
          success: false,
          message: `无效的时间表达式: ${schedule}\n请使用正确的Cron格式，如 "0 9 * * *" (每天9点)`,
        };
      }
    }
    
    const finalSchedule = cronResult?.cron || schedule;
    const description = cronResult?.description || scheduleDescription || getCronDescription(finalSchedule);
    
    return this.createTask(userId, {
      schedule: finalSchedule,
      taskName: taskName || '时间提醒',
      scheduleDescription: description,
    });
  }

  private async createTaskFromCommand(
    userId: string,
    parseResult: CommandParseResult
  ): Promise<TaskCreateResponse> {
    const { schedule, taskName } = parseResult.params;
    
    if (!schedule) {
      return { success: false, message: '请指定时间表达式 --schedule' };
    }
    
    if (!validateCronExpression(schedule)) {
      return {
        success: false,
        message: `无效的Cron表达式: ${schedule}\n正确格式示例: "0 9 * * *" (每天9点)`,
      };
    }
    
    return this.createTask(userId, {
      schedule,
      taskName: taskName || '时间提醒',
      scheduleDescription: getCronDescription(schedule),
    });
  }

  private async createTask(
    userId: string,
    options: {
      schedule: string;
      taskName: string;
      scheduleDescription: string;
    }
  ): Promise<TaskCreateResponse> {
    const userTaskCount = this.getUserTaskCount(userId);
    
    if (userTaskCount >= this.limitConfig.maxTasksPerUser) {
      return {
        success: false,
        message: `任务数量已达上限 (最多 ${this.limitConfig.maxTasksPerUser} 个)\n请先删除部分任务后再创建。`,
      };
    }
    
    const taskId = uuidv4();
    const now = new Date();
    const nextExecuteTime = calculateNextExecuteTime(options.schedule);
    
    const taskConfig: UserTaskConfig = {
      taskId,
      userId,
      taskName: options.taskName,
      schedule: options.schedule,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      messageTemplate: 'time_reminder',
      nextExecuteTime: nextExecuteTime || undefined,
      executeCount: 0,
    };
    
    this.addUserTask(userId, taskConfig);
    
    const scheduledTask = cron.schedule(options.schedule, () => {
      this.executeTask(taskId);
    });
    
    this.scheduledTasks.set(taskId, scheduledTask);
    
    logger.info('TaskManager', 'Task created', {
      taskId,
      userId: this.maskUserId(userId),
      schedule: options.schedule,
      taskName: options.taskName,
    });
    
    this.persistTasks();
    
    return {
      success: true,
      taskId,
      taskName: options.taskName,
      schedule: options.schedule,
      scheduleDescription: options.scheduleDescription,
      nextExecuteTime: nextExecuteTime || undefined,
      message: `已为您创建定时任务！\n任务名称：${options.taskName}\n执行时间：${options.scheduleDescription}\n下次执行：${nextExecuteTime ? this.formatDateTime(nextExecuteTime) : '计算失败'}`,
    };
  }

  private listTasks(userId: string): TaskCreateResponse {
    const tasks = this.getUserTasks(userId);
    
    if (tasks.length === 0) {
      return { success: true, message: '您还没有创建任何定时任务。' };
    }
    
    const taskList = tasks.map((task, index) => {
      const status = task.enabled ? '✅ 启用' : '❌ 禁用';
      const nextTime = task.nextExecuteTime
        ? this.formatDateTime(task.nextExecuteTime)
        : '未计算';
      return `${index + 1}. ${task.taskName}\n   ID: ${task.taskId}\n   时间: ${getCronDescription(task.schedule)}\n   状态: ${status}\n   下次执行: ${nextTime}`;
    }).join('\n\n');
    
    return {
      success: true,
      message: `📋 您的定时任务 (${tasks.length}/${this.limitConfig.maxTasksPerUser})\n\n${taskList}`,
    };
  }

  deleteTask(userId: string, taskId: string): TaskCreateResponse {
    const task = this.findUserTask(userId, taskId);
    
    if (!task) {
      return { success: false, message: '任务不存在或您没有权限删除此任务。' };
    }
    
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.stop();
      this.scheduledTasks.delete(taskId);
    }
    
    this.removeUserTask(userId, taskId);
    
    this.persistTasks();
    
    logger.info('TaskManager', 'Task deleted', {
      taskId,
      userId: this.maskUserId(userId),
    });
    
    return { success: true, message: `任务 "${task.taskName}" 已删除。` };
  }

  updateTaskStatus(userId: string, taskId: string, enabled: boolean): TaskCreateResponse {
    const task = this.findUserTask(userId, taskId);
    
    if (!task) {
      return { success: false, message: '任务不存在或您没有权限修改此任务。' };
    }
    
    task.enabled = enabled;
    task.updatedAt = new Date();
    
    this.persistTasks();
    
    if (enabled) {
      if (!this.scheduledTasks.has(taskId)) {
        const scheduledTask = cron.schedule(task.schedule, () => {
          this.executeTask(taskId);
        });
        this.scheduledTasks.set(taskId, scheduledTask);
      }
    } else {
      const scheduledTask = this.scheduledTasks.get(taskId);
      if (scheduledTask) {
        scheduledTask.stop();
        this.scheduledTasks.delete(taskId);
      }
    }
    
    const statusText = enabled ? '已启用' : '已禁用';
    logger.info('TaskManager', `Task ${statusText}`, { taskId, enabled });
    
    return { success: true, message: `任务 "${task.taskName}" ${statusText}。` };
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = this.findTaskById(taskId);
    
    if (!task || !task.enabled) {
      return;
    }
    
    const startTime = Date.now();
    
    try {
      const message = this.generateTimeMessage();
      
      await lineService.pushMessage(task.userId, [{
        type: 'text',
        text: message,
      }]);
      
      await llmService.addSystemMessage(task.userId, message);
      
      task.executeCount++;
      task.lastExecuteTime = new Date();
      task.nextExecuteTime = calculateNextExecuteTime(task.schedule) || undefined;
      
      const duration = Date.now() - startTime;
      logger.task(taskId, task.taskName, 'success', duration);
      
      this.persistTasks();
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.task(taskId, task.taskName, 'failed', duration, error.message);
      
      task.nextExecuteTime = calculateNextExecuteTime(task.schedule) || undefined;
      this.persistTasks();
    }
  }

  private generateTimeMessage(): string {
    const now = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const weekday = weekdays[now.getDay()];
    
    return [
      '⏰ 时间提醒',
      `当前时间：${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
      `星期${weekday}`,
    ].join('\n');
  }

  getUserTasks(userId: string): UserTaskConfig[] {
    return this.userTasks.get(userId) || [];
  }

  getUserTaskCount(userId: string): number {
    return this.getUserTasks(userId).length;
  }

  private addUserTask(userId: string, task: UserTaskConfig): void {
    const tasks = this.getUserTasks(userId);
    tasks.push(task);
    this.userTasks.set(userId, tasks);
  }

  private removeUserTask(userId: string, taskId: string): void {
    const tasks = this.getUserTasks(userId);
    const index = tasks.findIndex(t => t.taskId === taskId);
    if (index !== -1) {
      tasks.splice(index, 1);
      this.userTasks.set(userId, tasks);
    }
  }

  private findUserTask(userId: string, taskId: string): UserTaskConfig | undefined {
    const tasks = this.getUserTasks(userId);
    return tasks.find(t => t.taskId === taskId);
  }

  private findTaskById(taskId: string): UserTaskConfig | undefined {
    for (const tasks of this.userTasks.values()) {
      const task = tasks.find(t => t.taskId === taskId);
      if (task) return task;
    }
    return undefined;
  }

  stopAll(): void {
    for (const [taskId, task] of this.scheduledTasks) {
      task.stop();
      logger.info('TaskManager', 'Task stopped', { taskId });
    }
    this.scheduledTasks.clear();
    logger.info('TaskManager', 'All tasks stopped');
  }

  getStats(): { totalTasks: number; totalUsers: number; activeTasks: number } {
    let totalTasks = 0;
    let activeTasks = 0;
    
    for (const tasks of this.userTasks.values()) {
      totalTasks += tasks.length;
      activeTasks += tasks.filter(t => t.enabled).length;
    }
    
    return {
      totalTasks,
      totalUsers: this.userTasks.size,
      activeTasks,
    };
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private maskUserId(userId: string): string {
    if (userId.length <= 8) return '***';
    return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
  }
}

export const taskManagerService = new TaskManagerService();
