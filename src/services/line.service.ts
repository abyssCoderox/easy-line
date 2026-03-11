import * as line from '@line/bot-sdk';
import { config } from '../config';

export interface LineConfig {
  channelSecret: string;
  channelAccessToken: string;
}

export class LineService {
  private client: line.Client;
  private middlewareConfig: line.MiddlewareConfig;
  
  constructor(config: LineConfig) {
    this.client = new line.Client({
      channelAccessToken: config.channelAccessToken,
    });
    this.middlewareConfig = {
      channelSecret: config.channelSecret,
    };
  }
  
  getMiddleware() {
    return line.middleware(this.middlewareConfig);
  }
  
  async replyMessage(replyToken: string, messages: line.Message[]) {
    return this.client.replyMessage(replyToken, messages);
  }
  
  async pushMessage(to: string, messages: line.Message[]) {
    return this.client.pushMessage(to, messages);
  }
  
  async multicast(to: string[], messages: line.Message[]) {
    return this.client.multicast(to, messages);
  }
  
  async getUserProfile(userId: string): Promise<line.Profile> {
    return this.client.getProfile(userId);
  }
}

export const lineService = new LineService({
  channelSecret: config.line.channelSecret,
  channelAccessToken: config.line.channelAccessToken,
});
