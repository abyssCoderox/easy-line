import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { logger } from '../logger.service';

export const alertQueryTool = new DynamicStructuredTool({
  name: 'alert_query',
  description: '查询系统告警信息。当用户询问告警、报警、警报、监控问题、异常时使用此工具。',
  schema: z.object({
    level: z.enum(['critical', 'warning', 'info', 'all'])
      .optional()
      .describe('告警级别筛选：critical(严重)、warning(警告)、info(信息)、all(全部)'),
    limit: z.number().min(1).max(50).optional()
      .describe('返回条数限制，默认10条'),
    device: z.string().optional()
      .describe('设备名称筛选'),
  }),
  func: async ({ level = 'all', limit = 10, device }) => {
    const toolName = 'alert_query';
    const input = { level, limit, device };
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      input: JSON.stringify(input),
    });

    try {
      const apiUrl = process.env.ALERT_API_URL;
      
      if (!apiUrl) {
        const output = {
          success: false,
          error: 'ALERT_API_URL not configured',
          alerts: [],
        };
        logger.warn('ALARM', `[${toolName}] API URL not configured`);
        logger.debug('ALARM', `[${toolName}] Output`, {
          output: JSON.stringify(output),
        });
        return JSON.stringify(output);
      }
      
      logger.debug('ALARM', `[${toolName}] Calling API`, {
        url: apiUrl,
        params: JSON.stringify(input),
      });

      const response = await axios.get(apiUrl, {
        params: { level, limit, device },
        timeout: 10000,
      });
      
      const alerts = response.data?.data?.alerts || [];
      
      const output = {
        success: true,
        total: alerts.length,
        alerts: alerts.map((alert: any) => ({
          id: alert.id,
          level: alert.level,
          device: alert.device,
          message: alert.message,
          timestamp: alert.timestamp,
          status: alert.status,
        })),
      };

      logger.debug('ALARM', `[${toolName}] Output`, {
        alertCount: alerts.length,
        output: JSON.stringify(output),
      });

      logger.info('ALARM', `[${toolName}] Query completed`, {
        alertCount: alerts.length,
        level,
      });
      
      return JSON.stringify(output);
    } catch (error: any) {
      logger.error('ALARM', `[${toolName}] Error`, {
        input: JSON.stringify(input),
        error: error.message,
        stack: error.stack,
      });
      return JSON.stringify({
        success: false,
        error: error.message,
        alerts: [],
      });
    }
  },
});
