import express from 'express';
import dotenv from 'dotenv';
import { config, validateConfig } from './config';
import { schedulerService } from './services/scheduler.service';
import webhookRoutes from './routes/webhook';
import apiRoutes from './routes/api';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

dotenv.config();

try {
  validateConfig();
} catch (error) {
  console.error('Config validation failed:', error);
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

app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  schedulerService.loadTasks();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  schedulerService.stopAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
