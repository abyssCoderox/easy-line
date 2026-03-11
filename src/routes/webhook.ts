import { Router } from 'express';
import { lineService } from '../services/line.service';
import { llmService } from '../services/llm.service';
import { WebhookEvent } from '../types';

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

export default router;
