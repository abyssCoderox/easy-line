import cron from 'node-cron';
import { CronJob } from 'cron';

export function validateCronExpression(expression: string): boolean {
  if (!expression || typeof expression !== 'string') {
    return false;
  }
  
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  
  return cron.validate(expression);
}

export function getCronDescription(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return '无效的Cron表达式';
  }
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
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
    { pattern: /每(\d+)分钟/, cron: '*/X * * * *', description: '每 X 分钟' },
    { pattern: /每小时/, cron: '0 * * * *', description: '每小时整点' },
    { pattern: /每天\s*(\d+)点/, cron: '0 X * * *', description: '每天 X:00' },
    { pattern: /每天\s*(\d+)点(\d+)分/, cron: 'M X * * *', description: '每天 X:M' },
    { pattern: /每天早上(\d+)点/, cron: '0 X * * *', description: '每天 X:00' },
    { pattern: /每天晚上(\d+)点/, cron: '0 X * * *', description: '每天 X:00' },
    { pattern: /每周([一二三四五六日天])\s*(\d+)点/, cron: '0 X * * D', description: '每周X X:00' },
    { pattern: /工作日\s*(\d+)点/, cron: '0 X * * 1-5', description: '工作日 X:00' },
    { pattern: /每([一二三四五六日天])\s*(\d+)点/, cron: '0 X * * D', description: '每周X X:00' },
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
          const hour = parseInt(match[1], 10);
          if (hour >= 0 && hour <= 23) {
            result = result.replace('X', String(hour));
            desc = desc.replace('X', String(hour).padStart(2, '0'));
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
          result = result.replace('X', String(hour));
          desc = desc.replace('X', String(hour).padStart(2, '0'));
        }
      }
      
      if (match[3]) {
        const minute = parseInt(match[3], 10);
        if (minute >= 0 && minute <= 59) {
          result = result.replace('M', String(minute));
        }
      }
      
      if (validateCronExpression(result)) {
        return { cron: result, description: desc };
      }
    }
  }
  
  return null;
}
