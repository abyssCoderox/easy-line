import { SSEMessage } from '../types';

export interface SSEClientOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface SSEClientResult {
  messages: SSEMessage[];
  rawText: string;
  decisionResults: any[];
}

export class SSEClient {
  private controller: AbortController | null = null;

  async connect(options: SSEClientOptions): Promise<SSEClientResult> {
    const { url, method = 'POST', headers = {}, body, timeout = 60000 } = options;

    this.controller = new AbortController();
    const timeoutId = setTimeout(() => {
      this.controller?.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: this.controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      return await this.parseSSEStream(response.body);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('SSE connection timeout');
      }
      throw error;
    }
  }

  private async parseSSEStream(stream: ReadableStream<Uint8Array>): Promise<SSEClientResult> {
    const messages: SSEMessage[] = [];
    const decisionResults: any[] = [];
    let rawText = '';
    let buffer = '';

    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data) {
              rawText += line + '\n';
              try {
                const message = JSON.parse(data) as SSEMessage;
                messages.push(message);

                if (message.type === 'decision_results' && message.payload) {
                  if (Array.isArray(message.payload)) {
                    decisionResults.push(...message.payload);
                  } else if (message.payload.results) {
                    decisionResults.push(...message.payload.results);
                  } else {
                    decisionResults.push(message.payload);
                  }
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE message:', data);
              }
            }
          }
        }
      }

      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data) {
          rawText += buffer + '\n';
          try {
            const message = JSON.parse(data) as SSEMessage;
            messages.push(message);

            if (message.type === 'decision_results' && message.payload) {
              if (Array.isArray(message.payload)) {
                decisionResults.push(...message.payload);
              } else if (message.payload.results) {
                decisionResults.push(...message.payload.results);
              } else {
                decisionResults.push(message.payload);
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE message:', data);
          }
        }
      }

      return { messages, rawText, decisionResults };
    } finally {
      reader.releaseLock();
    }
  }

  abort(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }
}

export async function fetchSSE(options: SSEClientOptions): Promise<SSEClientResult> {
  const client = new SSEClient();
  return client.connect(options);
}
