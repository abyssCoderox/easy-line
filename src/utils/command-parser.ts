import { CommandParseResult } from '../types';

const COMMAND_PATTERNS = {
  create: /^\/task\s+create\s+--schedule\s+["']([^"']+)["'](?:\s+--name\s+["']([^"']+)["'])?$/i,
  list: /^\/task\s+list$/i,
  delete: /^\/task\s+delete\s+(\S+)$/i,
  enable: /^\/task\s+enable\s+(\S+)$/i,
  disable: /^\/task\s+disable\s+(\S+)$/i,
  help: /^\/task\s+help$/i,
};

export function parseCommand(input: string): CommandParseResult {
  const trimmedInput = input.trim();
  
  if (!trimmedInput.startsWith('/task')) {
    return { command: null, params: {} };
  }
  
  const createMatch = trimmedInput.match(COMMAND_PATTERNS.create);
  if (createMatch) {
    return {
      command: 'create',
      params: {
        schedule: createMatch[1],
        taskName: createMatch[2] || '时间提醒',
      },
    };
  }
  
  const listMatch = trimmedInput.match(COMMAND_PATTERNS.list);
  if (listMatch) {
    return { command: 'list', params: {} };
  }
  
  const deleteMatch = trimmedInput.match(COMMAND_PATTERNS.delete);
  if (deleteMatch) {
    return {
      command: 'delete',
      params: { taskId: deleteMatch[1] },
    };
  }
  
  const enableMatch = trimmedInput.match(COMMAND_PATTERNS.enable);
  if (enableMatch) {
    return {
      command: 'enable',
      params: { taskId: enableMatch[1], enabled: true },
    };
  }
  
  const disableMatch = trimmedInput.match(COMMAND_PATTERNS.disable);
  if (disableMatch) {
    return {
      command: 'disable',
      params: { taskId: disableMatch[1], enabled: false },
    };
  }
  
  const helpMatch = trimmedInput.match(COMMAND_PATTERNS.help);
  if (helpMatch) {
    return { command: 'help', params: {} };
  }
  
  return {
    command: null,
    params: {},
    error: '无法识别的命令格式。使用 /task help 查看帮助。',
  };
}

export function getHelpMessage(): string {
  return `📋 任务管理命令帮助

创建任务:
  /task create --schedule "CRON表达式" [--name "任务名称"]
  示例: /task create --schedule "0 9 * * *" --name "早间提醒"

列出任务:
  /task list

删除任务:
  /task delete <任务ID>

启用/禁用任务:
  /task enable <任务ID>
  /task disable <任务ID>

Cron表达式说明:
  "0 9 * * *"     - 每天 09:00
  "0 9,18 * * *"  - 每天 09:00 和 18:00
  "*/30 * * * *"  - 每 30 分钟
  "0 9 * * 1"     - 每周一 09:00
  "0 9 * * 1-5"   - 周一到周五 09:00

也可以直接说:
  "每天早上9点提醒我"
  "每小时提醒我一次"`;
}

export function isCommand(input: string): boolean {
  return input.trim().startsWith('/task');
}
