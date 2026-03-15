import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

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
    try {
      const apiUrl = process.env.ALERT_API_URL;
      
      if (!apiUrl) {
        return JSON.stringify({
          success: false,
          error: 'ALERT_API_URL not configured',
          alerts: [],
        });
      }
      
      const response = await axios.get(apiUrl, {
        params: { level, limit, device },
        timeout: 10000,
      });
      
      const alerts = response.data?.data?.alerts || [];
      
      return JSON.stringify({
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
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        alerts: [],
      });
    }
  },
});
