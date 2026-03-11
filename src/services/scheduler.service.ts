import cron from 'node-cron';
import axios from 'axios';
import { TaskConfig, TaskExecutionLog, TaskConfigFile } from '../types';
import { lineService } from './line.service';

import * as taskConfigFile from '../config/tasks.json';

export class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private logs: TaskExecutionLog[] = [];
  
  loadTasks(): void {
    const configs: TaskConfig[] = (taskConfigFile as TaskConfigFile).tasks;
    
    for (const config of configs) {
      if (!config.enabled) {
        console.log(`Task skipped (disabled): ${config.name}`);
        continue;
      }
      
      if (!cron.validate(config.schedule)) {
        console.error(`Invalid cron: ${config.schedule} for task: ${config.name}`);
        continue;
      }
      
      const task = cron.schedule(config.schedule, () => {
        this.executeTask(config);
      });
      
      this.tasks.set(config.id, task);
      console.log(`Task loaded: ${config.name} (${config.schedule})`);
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
      console.log(`Task completed: ${config.name} (${log.duration}ms)`);
      
    } catch (error: any) {
      log.status = 'failed';
      log.error = error.message;
      console.error(`Task failed: ${config.name}`, error);
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
    }
    this.tasks.clear();
    console.log('All tasks stopped');
  }
}

export const schedulerService = new SchedulerService();
