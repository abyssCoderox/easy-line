import { Router } from 'express';
import { lineService } from '../services/line.service';
import { llmService } from '../services/llm.service';
import { taskManagerService } from '../services/task-manager.service';
import { WebhookEvent } from '../types';
import { isCommand } from '../utils/command-parser';
import { logger } from '../services/logger.service';

const router = Router();

router.post('/', lineService.getMiddleware(), async (req, res) => {
  try {
    const events: WebhookEvent[] = req.body.events;
    
    await Promise.all(events.map(handleEvent));
    
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ status: 'error' });
  }
});

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== 'message') return;
  if (event.message.type !== 'text') return;
  
  const userId = event.source.userId!;
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  
  try {
    if (isCommand(userMessage)) {
      const taskResult = await taskManagerService.processInput(userId, userMessage);
      
      logger.info('Webhook', 'Task command processed', {
        userId: maskUserId(userId),
        input: userMessage.substring(0, 50),
        success: taskResult.success,
      });
      
      await lineService.replyMessage(replyToken, [{
        type: 'text',
        text: taskResult.message || '命令处理完成',
      }]);
      return;
    }
    
    const intentResult = await llmService.recognizeIntent(userMessage);
    
    if (intentResult.intent === 'create_task' && intentResult.confidence > 0.7) {
      const { schedule, scheduleDescription, taskName } = intentResult.entities || {};
      
      if (schedule) {
        const taskResult = await taskManagerService.createTaskFromNaturalLanguage(
          userId,
          schedule,
          scheduleDescription,
          taskName
        );
        
        logger.info('Webhook', 'Task created via natural language', {
          userId: maskUserId(userId),
          schedule,
          success: taskResult.success,
        });
        
        await lineService.replyMessage(replyToken, [{
          type: 'text',
          text: taskResult.message || '任务创建完成',
        }]);
        return;
      }
    }
    
    const reply = await llmService.chat(userId, userMessage);
    
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: reply,
    }]);
  } catch (error) {
    console.error('Handle event error:', error);
    
    await lineService.replyMessage(replyToken, [{
      type: 'text',
      text: '抱歉，处理您的消息时出现错误，请稍后再试。',
    }]);
  }
}

function maskUserId(userId: string): string {
  if (userId.length <= 8) return '***';
  return userId.substring(0, 4) + '****' + userId.substring(userId.length - 4);
}

export default router;
