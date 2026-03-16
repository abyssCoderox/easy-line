import express from 'express';
import dotenv from 'dotenv';
import { config, validateConfig } from './config';
import { validateAlarmConfig } from './config';
import { schedulerService } from './services/scheduler.service';
import { logger } from './services/logger.service';
import webhookRoutes from './routes/webhook';
import apiRoutes from './routes/api';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';

dotenv.config();

try {
  validateConfig();
  validateAlarmConfig();
  logger.info('Config', 'Configuration validated successfully');
} catch (error: any) {
  logger.error('Config', 'Configuration validation failed', { error: error.message });
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      line: 'connected',
      scheduler: 'running',
      tasks: schedulerService.getTaskStatus().length,
    },
  });
});

app.get('/ready', (req, res) => {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
  });
});

app.use(loggingMiddleware);

app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info('Server', `Server started`, { port: PORT });
  schedulerService.loadTasks();
});

process.on('SIGTERM', () => {
  logger.info('Server', 'SIGTERM received, shutting down...');
  schedulerService.stopAll();
  server.close(() => {
    logger.info('Server', 'Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Server', 'SIGINT received, shutting down...');
  schedulerService.stopAll();
  server.close(() => {
    logger.info('Server', 'Server closed');
    process.exit(0);
  });
});

export default app;
