import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';
import { logger } from '../logger.service';

export const deviceStatusTool = new DynamicStructuredTool({
  name: 'device_status',
  description: '查询设备运行状态。当用户询问设备状态、服务器状态、机器状态、设备是否在线时使用此工具。',
  schema: z.object({
    deviceId: z.string().optional()
      .describe('设备ID或名称，不提供则查询所有设备'),
    status: z.enum(['online', 'offline', 'all'])
      .optional()
      .describe('状态筛选：online(在线)、offline(离线)、all(全部)'),
  }),
  func: async ({ deviceId, status = 'all' }) => {
    const toolName = 'device_status';
    const input = { deviceId, status };
    
    logger.debug('ALARM', `[${toolName}] Input`, {
      input: JSON.stringify(input),
    });

    try {
      const apiUrl = process.env.DEVICE_API_URL;
      
      if (!apiUrl) {
        const output = {
          success: false,
          error: 'DEVICE_API_URL not configured',
          devices: [],
        };
        logger.warn('ALARM', `[${toolName}] API URL not configured`);
        logger.debug('ALARM', `[${toolName}] Output`, {
          output: JSON.stringify(output),
        });
        return JSON.stringify(output);
      }
      
      const params: Record<string, any> = { status };
      if (deviceId) {
        params.deviceId = deviceId;
      }
      
      logger.debug('ALARM', `[${toolName}] Calling API`, {
        url: apiUrl,
        params: JSON.stringify(params),
      });

      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000,
      });
      
      const devices = response.data?.data?.devices || [];
      
      const output = {
        success: true,
        total: devices.length,
        devices: devices.map((device: any) => ({
          id: device.id,
          name: device.name,
          status: device.status,
          cpu: device.cpu,
          memory: device.memory,
          lastSeen: device.lastSeen,
        })),
      };

      logger.debug('ALARM', `[${toolName}] Output`, {
        deviceCount: devices.length,
        output: JSON.stringify(output),
      });

      logger.info('ALARM', `[${toolName}] Query completed`, {
        deviceCount: devices.length,
        status,
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
        devices: [],
      });
    }
  },
});
