import { Router } from 'express';
import { schedulerService } from '../services/scheduler.service';
import { lineService } from '../services/line.service';
import { llmService } from '../services/llm.service';
import { taskManagerService } from '../services/task-manager.service';
import { authenticateApiKey } from '../middleware/auth.middleware';
import { ChatRequest, ChatResponse, UserTaskConfig } from '../types';
import { isCommand } from '../utils/command-parser';

const router = Router();

router.get('/tasks', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      tasks: schedulerService.getTaskStatus(),
      userTasks: taskManagerService.getStats(),
    },
  });
});

router.get('/tasks/user/:userId', authenticateApiKey, (req, res) => {
  const { userId } = req.params;
  const tasks = taskManagerService.getUserTasks(userId);
  
  res.json({
    code: 0,
    message: 'success',
    data: {
      tasks: tasks.map((task: UserTaskConfig) => ({
        taskId: task.taskId,
        taskName: task.taskName,
        schedule: task.schedule,
        enabled: task.enabled,
        createdAt: task.createdAt,
        nextExecuteTime: task.nextExecuteTime,
        executeCount: task.executeCount,
      })),
      total: tasks.length,
    },
  });
});

router.delete('/tasks/:taskId', authenticateApiKey, async (req, res) => {
  const { taskId } = req.params;
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    return res.status(400).json({
      code: 400,
      message: 'X-User-Id header is required',
    });
  }
  
  const result = taskManagerService.deleteTask(userId, taskId);
  
  if (result.success) {
    res.json({
      code: 0,
      message: 'success',
      data: {
        taskId,
        deleted: true,
      },
    });
  } else {
    res.status(404).json({
      code: 404,
      message: result.message,
    });
  }
});

router.patch('/tasks/:taskId', authenticateApiKey, async (req, res) => {
  const { taskId } = req.params;
  const { enabled } = req.body;
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    return res.status(400).json({
      code: 400,
      message: 'X-User-Id header is required',
    });
  }
  
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      code: 400,
      message: 'enabled field must be a boolean',
    });
  }
  
  const result = taskManagerService.updateTaskStatus(userId, taskId, enabled);
  
  if (result.success) {
    res.json({
      code: 0,
      message: 'success',
      data: {
        taskId,
        enabled,
      },
    });
  } else {
    res.status(404).json({
      code: 404,
      message: result.message,
    });
  }
});

router.get('/tasks/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json({
    code: 0,
    message: 'success',
    data: {
      logs: schedulerService.getLogs(limit),
    },
  });
});

router.post('/messages/push', async (req, res) => {
  try {
    const { targetType, targetIds, messages } = req.body;
    
    if (targetType === 'user') {
      for (const userId of targetIds) {
        await lineService.pushMessage(userId, messages);
      }
    } else {
      await lineService.multicast(targetIds, messages);
    }
    
    res.json({
      code: 0,
      message: 'success',
      data: { sentCount: targetIds.length },
    });
  } catch (error: any) {
    res.status(500).json({
      code: 500,
      message: error.message,
    });
  }
});

router.post('/chat', authenticateApiKey, async (req, res) => {
  const { userId, message } = req.body as ChatRequest;
  
  if (!userId || !message) {
    return res.status(400).json({
      code: 400,
      message: 'Missing required fields: userId and message are required',
    });
  }
  
  if (typeof userId !== 'string' || typeof message !== 'string') {
    return res.status(400).json({
      code: 400,
      message: 'Invalid field types: userId and message must be strings',
    });
  }
  
  if (userId.length < 1 || userId.length > 100) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid userId: must be between 1 and 100 characters',
    });
  }
  
  if (message.length < 1 || message.length > 5000) {
    return res.status(400).json({
      code: 400,
      message: 'Invalid message: must be between 1 and 5000 characters',
    });
  }
  
  try {
    if (isCommand(message)) {
      const taskResult = await taskManagerService.processInput(userId, message);
      
      const response: ChatResponse = {
        code: 0,
        message: 'success',
        data: {
          userId,
          reply: taskResult.message || '命令处理完成',
          timestamp: new Date().toISOString(),
          ...(taskResult.taskId && {
            taskInfo: {
              taskId: taskResult.taskId,
              taskName: taskResult.taskName,
              schedule: taskResult.schedule,
              nextExecuteTime: taskResult.nextExecuteTime,
            },
          }),
        },
      };
      
      return res.json(response);
    }
    
    const intentResult = await llmService.recognizeIntent(message);
    
    if (intentResult.intent === 'create_task' && intentResult.confidence > 0.7) {
      const { schedule, scheduleDescription, taskName } = intentResult.entities || {};
      
      if (schedule) {
        const taskResult = await taskManagerService.createTaskFromNaturalLanguage(
          userId,
          schedule,
          scheduleDescription,
          taskName
        );
        
        const response: ChatResponse = {
          code: 0,
          message: 'success',
          data: {
            userId,
            reply: taskResult.message || '任务创建完成',
            timestamp: new Date().toISOString(),
            ...(taskResult.taskId && {
              taskInfo: {
                taskId: taskResult.taskId,
                taskName: taskResult.taskName,
                schedule: taskResult.schedule,
                nextExecuteTime: taskResult.nextExecuteTime,
              },
            }),
          },
        };
        
        return res.json(response);
      }
    }
    
    const reply = await llmService.chat(userId, message);
    
    const response: ChatResponse = {
      code: 0,
      message: 'success',
      data: {
        userId,
        reply,
        timestamp: new Date().toISOString(),
      },
    };
    
    res.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error during chat processing',
    });
  }
});

export default router;
