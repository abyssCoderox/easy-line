import cron from 'node-cron';
import axios from 'axios';
import { TaskConfig, TaskExecutionLog, TaskConfigFile } from '../types';
import { lineService } from './line.service';
import { logger } from './logger.service';

import * as taskConfigFile from '../config/tasks.json';

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private logs: TaskExecutionLog[] = [];
  
  loadTasks(): void {
    const configs: TaskConfig[] = (taskConfigFile as TaskConfigFile).tasks;
    
    for (const config of configs) {
      if (!config.enabled) {
        logger.warn('Scheduler', `Task skipped (disabled): ${config.name}`, { taskId: config.id });
        continue;
      }
      
      if (!cron.validate(config.schedule)) {
        logger.error('Scheduler', `Invalid cron expression`, { 
          taskId: config.id, 
          schedule: config.schedule 
        });
        continue;
      }
      
      const task = cron.schedule(config.schedule, () => {
        this.executeTask(config);
      });
      
      this.tasks.set(config.id, task);
      logger.info('Scheduler', `Task loaded`, { 
        taskId: config.id, 
        taskName: config.name, 
        schedule: config.schedule 
      });
    }
  }

  private async executeTask(config: TaskConfig): Promise<void> {
    const startTime = Date.now();
    const log: TaskExecutionLog = {
      taskId: config.id,
      executeTime: new Date(),
      status: 'success',
    };
    
    try {
      const response = await axios({
        method: config.api.method,
        url: config.api.url,
        headers: config.api.headers,
        timeout: 30000,
      });

      const message = this.renderTemplate(config.template, response.data);
      
      await lineService.multicast(config.targets, [{
        type: 'text',
        text: message,
      }]);
      
      log.duration = Date.now() - startTime;
      logger.task(config.id, config.name, 'success', log.duration);
      
    } catch (error: any) {
      log.status = 'failed';
      log.error = error.message;
      log.duration = Date.now() - startTime;
      logger.task(config.id, config.name, 'failed', log.duration, error.message);
    }
    
    this.logs.push(log);
  }

  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      return data[key] !== undefined ? String(data[key]) : '';
    });
  }

  getTaskStatus(): { id: string; running: boolean }[] {
    return Array.from(this.tasks.keys()).map(id => ({
      id,
      running: this.tasks.has(id),
    }));
  }

  getLogs(limit: number = 100): TaskExecutionLog[] {
    return this.logs.slice(-limit);
  }

  stopAll(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
      logger.info('Scheduler', `Task stopped`, { taskId: id });
    }
    this.tasks.clear();
    logger.info('Scheduler', 'All tasks stopped');
  }
}

export const schedulerService = new SchedulerService();
