import { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    res.status(401).json({
      code: 401,
      message: 'Missing API key: X-API-Key header is required',
    });
    return;
  }
  
  if (typeof apiKey !== 'string' || apiKey !== process.env.API_KEY) {
    res.status(401).json({
      code: 401,
      message: 'Invalid API key',
    });
    return;
  }
  
  next();
}
