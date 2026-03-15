import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { tavily } from '@tavily/core';

export interface TavilyToolOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export function createTavilyTool(options: TavilyToolOptions = {}): DynamicStructuredTool {
  const {
    maxResults = 5,
    searchDepth = 'basic',
    includeDomains,
    excludeDomains,
  } = options;

  return new DynamicStructuredTool({
    name: 'web_search',
    description: `搜索互联网获取实时信息。当用户询问以下内容时使用此工具：
- 最新新闻或事件
- 实时数据（股价、天气、汇率等）
- 需要联网查询的信息
- 你不确定的知识点

不要用于：
- 简单的常识问题
- 数学计算
- 已知的静态知识`,
    schema: z.object({
      query: z.string().describe('搜索查询关键词，使用简洁明确的关键词'),
    }),
    func: async ({ query }) => {
      try {
        if (!process.env.TAVILY_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'TAVILY_API_KEY not configured',
            results: [],
          });
        }

        const client = tavily({ apiKey: process.env.TAVILY_API_KEY });

        const searchOptions: Record<string, any> = {
          maxResults,
          searchDepth,
        };

        if (includeDomains && includeDomains.length > 0) {
          searchOptions.includeDomains = includeDomains;
        }
        if (excludeDomains && excludeDomains.length > 0) {
          searchOptions.excludeDomains = excludeDomains;
        }

        const response = await client.search(query, searchOptions);

        return JSON.stringify({
          success: true,
          query: response.query,
          answer: response.answer,
          total: response.results.length,
          results: response.results.map((r) => ({
            title: r.title,
            content: r.content,
            url: r.url,
            score: r.score,
            publishedDate: r.publishedDate,
          })),
        });
      } catch (error: any) {
        return JSON.stringify({
          success: false,
          error: error.message,
          results: [],
        });
      }
    },
  });
}

export const tavilyTool = createTavilyTool();
