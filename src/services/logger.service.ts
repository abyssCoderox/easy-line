import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'error' | 'warn' | 'info';

export interface LoggerConfig {
  level: LogLevel;
  dir: string;
  maxFileSize: number;
  maxFiles: number;
  console: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  meta?: Record<string, any>;
}

export type LogModule = 'HTTP' | 'Scheduler' | 'LLM' | 'LINE' | 'Config' | 'Server' | 'Auth' | 'Webhook' | 'TaskManager' | 'Test' | 'ALARM' | 'WORKORDER';

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  dir: 'logs',
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 30,
  console: true,
};

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

export class LoggerService {
  private config: LoggerConfig;
  private writeQueue: LogEntry[] = [];
  private isProcessing: boolean = false;
  private timezone: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.ensureLogDirectories();
  }

  private formatLocalTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
  }

  private ensureLogDirectories(): void {
    const levels: LogLevel[] = ['error', 'warn', 'info'];
    for (const level of levels) {
      const dir = path.join(this.config.dir, level);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  info(module: LogModule, message: string, meta?: Record<string, any>): void {
    this.log('info', module, message, meta);
  }

  warn(module: LogModule, message: string, meta?: Record<string, any>): void {
    this.log('warn', module, message, meta);
  }

  error(module: LogModule, message: string, meta?: Record<string, any>): void {
    this.log('error', module, message, meta);
  }

  private log(level: LogLevel, module: string, message: string, meta?: Record<string, any>): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: this.formatLocalTimestamp(),
      level,
      module,
      message,
      meta,
    };

    this.writeQueue.push(entry);
    this.processQueue();

    if (this.config.console) {
      this.logToConsole(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${metaStr}`;
    
    switch (entry.level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      default:
        console.log(logLine);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.writeQueue.length > 0) {
      const entry = this.writeQueue.shift();
      if (entry) {
        try {
          await this.writeToFile(entry);
        } catch (error) {
          console.error(`Failed to write log: ${error}`);
        }
      }
    }

    this.isProcessing = false;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    const date = entry.timestamp.split('T')[0];
    const fileName = `${entry.level}-${date}.log`;
    const filePath = path.join(this.config.dir, entry.level, fileName);

    await this.checkAndRotateFile(filePath);

    const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
    const logLine = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${metaStr}\n`;

    fs.appendFileSync(filePath, logLine, 'utf8');
  }

  private async checkAndRotateFile(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const stats = fs.statSync(filePath);
    if (stats.size >= this.config.maxFileSize) {
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const timestamp = Date.now();
      const rotatedPath = path.join(dir, `${base}.${timestamp}${ext}`);
      
      fs.renameSync(filePath, rotatedPath);

      await this.cleanOldFiles(dir);
    }
  }

  private async cleanOldFiles(dir: string): Promise<void> {
    const files = fs.readdirSync(dir)
      .filter(f => !f.endsWith('.log') || f.includes('.'))
      .map(f => ({
        name: f,
        path: path.join(dir, f),
        time: fs.statSync(path.join(dir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    while (files.length > this.config.maxFiles) {
      const file = files.pop();
      if (file) {
        fs.unlinkSync(file.path);
      }
    }
  }

  http(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    ip?: string,
    meta?: Record<string, any>
  ): void {
    this.info('HTTP', 'Request completed', {
      method,
      url,
      statusCode,
      duration,
      ip,
      ...meta,
    });
  }

  task(
    taskId: string,
    taskName: string,
    status: 'success' | 'failed',
    duration: number,
    error?: string
  ): void {
    const level = status === 'success' ? 'info' : 'error';
    this.log(level, 'Scheduler', `Task ${status}`, {
      taskId,
      taskName,
      duration,
      ...(error && { error }),
    });
  }

  getLogFilePath(level: LogLevel): string {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return path.join(this.config.dir, level, `${level}-${date}.log`);
  }
}

const loggerConfig: Partial<LoggerConfig> = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  dir: process.env.LOG_DIR || 'logs',
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || '10485760', 10),
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '30', 10),
  console: process.env.LOG_CONSOLE !== 'false',
};

export const logger = new LoggerService(loggerConfig);
