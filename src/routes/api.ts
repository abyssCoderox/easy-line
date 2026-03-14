import { Router } from 'express';
import { schedulerService } from '../services/scheduler.service';
import { lineService } from '../services/line.service';
import { llmService } from '../services/llm.service';
import { authenticateApiKey } from '../middleware/auth.middleware';
import { ChatRequest, ChatResponse } from '../types';

const router = Router();

router.get('/tasks', (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      tasks: schedulerService.getTaskStatus(),
    },
  });
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
