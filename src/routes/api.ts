import { Router } from 'express';
import { schedulerService } from '../services/scheduler.service';
import { lineService } from '../services/line.service';

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

export default router;
