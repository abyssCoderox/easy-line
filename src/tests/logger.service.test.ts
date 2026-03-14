import * as fs from 'fs';
import * as path from 'path';
import { LoggerService, LogLevel } from '../services/logger.service';

describe('LoggerService', () => {
  const testLogDir = path.join(__dirname, 'test-logs');
  let logger: LoggerService;

  beforeEach(() => {
    logger = new LoggerService({
      level: 'info',
      dir: testLogDir,
      maxFileSize: 1024,
      maxFiles: 5,
      console: false,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('基础日志功能', () => {
    it('should write info log to file', (done) => {
      logger.info('Test', 'Test info message', { key: 'value' });
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'info', `info-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('[INFO]');
        expect(content).toContain('[Test]');
        expect(content).toContain('Test info message');
        expect(content).toContain('key');
        done();
      }, 100);
    });

    it('should write warn log to file', (done) => {
      logger.warn('Test', 'Test warning message');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'warn', `warn-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('[WARN]');
        done();
      }, 100);
    });

    it('should write error log to file', (done) => {
      logger.error('Test', 'Test error message');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'error', `error-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('[ERROR]');
        done();
      }, 100);
    });
  });

  describe('日志级别过滤', () => {
    it('should not log info when level is error', (done) => {
      const errorLogger = new LoggerService({
        level: 'error',
        dir: testLogDir,
        console: false,
      });
      
      errorLogger.info('Test', 'This should not be logged');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'info', `info-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(false);
        done();
      }, 100);
    });

    it('should log error when level is error', (done) => {
      const errorLogger = new LoggerService({
        level: 'error',
        dir: testLogDir,
        console: false,
      });
      
      errorLogger.error('Test', 'This should be logged');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'error', `error-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        done();
      }, 100);
    });
  });

  describe('HTTP 日志', () => {
    it('should log HTTP request', (done) => {
      logger.http('GET', '/api/test', 200, 150, '127.0.0.1');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'info', `info-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('HTTP');
        expect(content).toContain('GET');
        expect(content).toContain('/api/test');
        expect(content).toContain('200');
        expect(content).toContain('150');
        done();
      }, 100);
    });
  });

  describe('任务日志', () => {
    it('should log successful task execution', (done) => {
      logger.task('task-001', 'Test Task', 'success', 500);
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'info', `info-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('Scheduler');
        expect(content).toContain('Task success');
        expect(content).toContain('task-001');
        done();
      }, 100);
    });

    it('should log failed task execution', (done) => {
      logger.task('task-002', 'Failed Task', 'failed', 300, 'Network error');
      
      setTimeout(() => {
        const logFile = path.join(testLogDir, 'error', `error-${new Date().toISOString().split('T')[0]}.log`);
        expect(fs.existsSync(logFile)).toBe(true);
        
        const content = fs.readFileSync(logFile, 'utf8');
        expect(content).toContain('Task failed');
        expect(content).toContain('Network error');
        done();
      }, 100);
    });
  });

  describe('日志轮转', () => {
    it('should rotate log file when size exceeds limit', (done) => {
      const smallLogger = new LoggerService({
        level: 'info',
        dir: testLogDir,
        maxFileSize: 100,
        maxFiles: 5,
        console: false,
      });

      for (let i = 0; i < 20; i++) {
        smallLogger.info('Test', `Long test message number ${i} to trigger rotation`);
      }
      
      setTimeout(() => {
        const infoDir = path.join(testLogDir, 'info');
        const files = fs.readdirSync(infoDir);
        expect(files.length).toBeGreaterThan(1);
        done();
      }, 200);
    });
  });

  describe('日志目录创建', () => {
    it('should create log directories if not exist', () => {
      const newLogDir = path.join(__dirname, 'new-test-logs');
      
      if (fs.existsSync(newLogDir)) {
        fs.rmSync(newLogDir, { recursive: true, force: true });
      }
      
      new LoggerService({
        level: 'info',
        dir: newLogDir,
        console: false,
      });
      
      expect(fs.existsSync(path.join(newLogDir, 'error'))).toBe(true);
      expect(fs.existsSync(path.join(newLogDir, 'warn'))).toBe(true);
      expect(fs.existsSync(path.join(newLogDir, 'info'))).toBe(true);
      
      fs.rmSync(newLogDir, { recursive: true, force: true });
    });
  });
});
