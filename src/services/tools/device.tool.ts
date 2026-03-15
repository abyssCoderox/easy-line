import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

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
    try {
      const apiUrl = process.env.DEVICE_API_URL;
      
      if (!apiUrl) {
        return JSON.stringify({
          success: false,
          error: 'DEVICE_API_URL not configured',
          devices: [],
        });
      }
      
      const params: Record<string, any> = { status };
      if (deviceId) {
        params.deviceId = deviceId;
      }
      
      const response = await axios.get(apiUrl, {
        params,
        timeout: 10000,
      });
      
      const devices = response.data?.data?.devices || [];
      
      return JSON.stringify({
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
      });
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        devices: [],
      });
    }
  },
});
