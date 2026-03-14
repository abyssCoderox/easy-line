import cron from 'node-cron';
import { CronJob } from 'cron';

export function validateCronExpression(expression: string): boolean {
  if (!expression || typeof expression !== 'string') {
    return false;
  }
  
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }
  
  return cron.validate(expression);
}

export function isSecondLevelCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  return parts.length === 6;
}

export function getCronDescription(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  
  if (parts.length !== 5 && parts.length !== 6) {
    return '无效的Cron表达式';
  }
  
  const hasSeconds = parts.length === 6;
  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = hasSeconds 
    ? parts 
    : ['0', ...parts];
  
  if (hasSeconds && second === '*' && minute === '*' && hour === '*') {
    return '每秒';
  }
  
  if (hasSeconds && second.startsWith('*/')) {
    const interval = second.substring(2);
    return `每 ${interval} 秒`;
  }
  
  if (hasSeconds && second !== '*' && second !== '0') {
    if (minute === '*' && hour === '*') {
      return `每分钟的第 ${second} 秒`;
    }
  }
  
  if (minute === '*' && hour === '*') {
    return '每分钟';
  }
  
  if (minute.startsWith('*/')) {
    const interval = minute.substring(2);
    return `每 ${interval} 分钟`;
  }
  
  if (hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (minute === '0') {
      return `每天 ${hour.padStart(2, '0')}:00`;
    }
    return `每天 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    if (dayOfWeek.includes('-')) {
      const [start, end] = dayOfWeek.split('-').map(Number);
      return `每周${weekdays[start]}到${weekdays[end]} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    const dayNum = parseInt(dayOfWeek, 10);
    if (!isNaN(dayNum)) {
      const dayName = dayNum === 0 ? weekdays[0] : weekdays[dayNum];
      return `每${dayName} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
  }
  
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `每月 ${dayOfMonth} 号 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  
  return expression;
}

export function calculateNextExecuteTime(expression: string): Date | null {
  if (!validateCronExpression(expression)) {
    return null;
  }
  
  try {
    const job = new CronJob(expression, () => {}, null, false);
    const nextDate = job.nextDate();
    return nextDate.toJSDate();
  } catch {
    return null;
  }
}

export function getNextExecuteTimes(expression: string, count: number = 5): Date[] {
  if (!validateCronExpression(expression)) {
    return [];
  }
  
  try {
    const job = new CronJob(expression, () => {}, null, false);
    const times: Date[] = [];
    
    for (let i = 0; i < count; i++) {
      const nextDate = job.nextDate();
      times.push(nextDate.toJSDate());
    }
    
    return times;
  } catch {
    return [];
  }
}

export function naturalLanguageToCron(input: string): { cron: string; description: string } | null {
  const patterns: Array<{
    pattern: RegExp;
    cron: string;
    description: string;
  }> = [
    { pattern: /每(\d+)秒/, cron: '*/X * * * * *', description: '每 X 秒' },
    { pattern: /每秒/, cron: '* * * * * *', description: '每秒' },
    { pattern: /每(\d+)分钟/, cron: '0 */X * * * *', description: '每 X 分钟' },
    { pattern: /每分钟/, cron: '0 * * * * *', description: '每分钟' },
    { pattern: /每小时/, cron: '0 0 * * * *', description: '每小时整点' },
    { pattern: /每天\s*(\d+)点(\d+)分(\d+)秒/, cron: 'S M H * * *', description: '每天 H:M:S' },
    { pattern: /每天\s*(\d+)点(\d+)分/, cron: '0 M H * * *', description: '每天 H:M' },
    { pattern: /每天\s*(\d+)点/, cron: '0 0 H * * *', description: '每天 H:00' },
    { pattern: /每天早上(\d+)点/, cron: '0 0 H * * *', description: '每天 H:00' },
    { pattern: /每天晚上(\d+)点/, cron: '0 0 H * * *', description: '每天 H:00' },
    { pattern: /每周([一二三四五六日天])\s*(\d+)点/, cron: '0 0 H * * D', description: '每周X H:00' },
    { pattern: /工作日\s*(\d+)点/, cron: '0 0 H * * 1-5', description: '工作日 H:00' },
    { pattern: /每([一二三四五六日天])\s*(\d+)点/, cron: '0 0 H * * D', description: '每周X H:00' },
  ];
  
  const weekdayMap: Record<string, string> = {
    '日': '0', '天': '0', '一': '1', '二': '2', '三': '3',
    '四': '4', '五': '5', '六': '6',
  };
  
  for (const { pattern, cron, description } of patterns) {
    const match = input.match(pattern);
    if (match) {
      let result = cron;
      let desc = description;
      
      if (match[1]) {
        if (cron.includes('X')) {
          const value = parseInt(match[1], 10);
          if (cron.startsWith('*/X *')) {
            if (value >= 1 && value <= 59) {
              result = result.replace('X', String(value));
              desc = desc.replace('X', String(value));
            }
          } else if (cron.includes('H')) {
            const hour = value;
            if (hour >= 0 && hour <= 23) {
              result = result.replace('H', String(hour));
              desc = desc.replace('H', String(hour).padStart(2, '0'));
            }
          }
        }
        if (cron.includes('D')) {
          const day = weekdayMap[match[1]] || '0';
          result = result.replace('D', day);
        }
      }
      
      if (match[2]) {
        const hour = parseInt(match[2], 10);
        if (hour >= 0 && hour <= 23) {
          result = result.replace('H', String(hour));
          desc = desc.replace('H', String(hour).padStart(2, '0'));
        }
      }
      
      if (match[3]) {
        const minute = parseInt(match[3], 10);
        if (minute >= 0 && minute <= 59) {
          result = result.replace('M', String(minute));
          desc = desc.replace('M', String(minute).padStart(2, '0'));
        }
      }
      
      if (match[4]) {
        const second = parseInt(match[4], 10);
        if (second >= 0 && second <= 59) {
          result = result.replace('S', String(second));
          desc = desc.replace('S', String(second).padStart(2, '0'));
        }
      }
      
      if (validateCronExpression(result)) {
        return { cron: result, description: desc };
      }
    }
  }
  
  return null;
}
