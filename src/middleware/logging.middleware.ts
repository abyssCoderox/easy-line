import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/logger.service';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (req.path === '/health' || req.path === '/ready') {
      return;
    }

    const shouldLogBody = 
      process.env.LOG_REQUEST_BODY === 'true' &&
      req.body && 
      Object.keys(req.body).length > 0;

    const meta: Record<string, any> | undefined = shouldLogBody 
      ? { requestBody: sanitizeBody(req.body) }
      : undefined;

    logger.http(
      req.method,
      req.originalUrl || req.path,
      res.statusCode,
      duration,
      ip,
      meta
    );
  });

  next();
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'authorization', 'x-api-key'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
    const lowerField = field.toLowerCase();
    for (const key of Object.keys(sanitized)) {
      if (key.toLowerCase().includes(lowerField)) {
        sanitized[key] = '***REDACTED***';
      }
    }
  }

  return sanitized;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  loggingMiddleware(req, res, next);
}
