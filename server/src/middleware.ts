import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
  };
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
}

export function validateRequestBody(required: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = required.filter((field) => !req.body[field]);

    if (missing.length > 0) {
      res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });
      return;
    }

    next();
  };
}

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[ERROR]', error.message);

  res.status(500).json({
    error: error.message || 'Internal server error',
  });
}
