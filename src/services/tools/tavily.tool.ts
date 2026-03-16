import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { tavily } from '@tavily/core';
import { logger } from '../logger.service';

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
      const toolName = 'web_search';
      const input = { query, maxResults, searchDepth };
      
      logger.debug('LLM', `[${toolName}] Input`, {
        input: JSON.stringify(input),
      });

      try {
        if (!process.env.TAVILY_API_KEY) {
          const output = {
            success: false,
            error: 'TAVILY_API_KEY not configured',
            results: [],
          };
          logger.warn('LLM', `[${toolName}] API key not configured`);
          logger.debug('LLM', `[${toolName}] Output`, {
            output: JSON.stringify(output),
          });
          return JSON.stringify(output);
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

        logger.debug('LLM', `[${toolName}] Calling Tavily API`, {
          query,
          options: JSON.stringify(searchOptions),
        });

        const response = await client.search(query, searchOptions);

        const output = {
          success: true,
          query: response.query,
          answer: response.answer,
          total: response.results.length,
          results: response.results.map((r: any) => ({
            title: r.title,
            content: r.content,
            url: r.url,
            score: r.score,
            publishedDate: r.publishedDate,
          })),
        };

        logger.debug('LLM', `[${toolName}] Output`, {
          resultCount: response.results.length,
          hasAnswer: !!response.answer,
          output: JSON.stringify(output).substring(0, 500) + '...',
        });

        logger.info('LLM', `[${toolName}] Search completed`, {
          query,
          resultCount: response.results.length,
          hasAnswer: !!response.answer,
        });

        return JSON.stringify(output);
      } catch (error: any) {
        logger.error('LLM', `[${toolName}] Error`, {
          input: JSON.stringify(input),
          error: error.message,
          stack: error.stack,
        });
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
