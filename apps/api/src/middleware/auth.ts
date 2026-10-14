import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UserRole } from '@invoiceai/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: UserRole;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'invoiceai_session';

export function generateToken(payload: AuthenticatedUser): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Authentication middleware supporting both HTTP-only cookies and Bearer tokens.
 * Enforces CSRF defense on cookie-authenticated mutating requests.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;
  let isCookieAuth = false;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Fallback to HTTP-only cookie
  if (!token && req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    token = req.cookies[SESSION_COOKIE_NAME];
    isCookieAuth = true;
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Authentication required. Missing session cookie or Bearer token.' });
    return;
  }

  // 3. CSRF Protection for Cookie-based mutating requests
  if (isCookieAuth && ['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
    const hasCustomHeader = req.headers['x-requested-with'] || req.headers['x-csrf-token'];
    const origin = req.headers.origin || req.headers.referer;

    // Check custom header or valid origin
    if (!hasCustomHeader && !origin) {
      res.status(403).json({ error: 'Forbidden: CSRF protection triggered. Missing custom request header.' });
      return;
    }
  }

  // 4. Verify JWT token
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthenticatedUser;
    req.user = decoded;
    req.tenantId = decoded.tenantId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session token.' });
    return;
  }
}

/**
 * Role-Based Access Control (RBAC) middleware.
 * Verifies that the authenticated user possesses an allowed role within the active tenant.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Action requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
        requiredRoles: allowedRoles,
        currentRole: req.user.role
      });
      return;
    }

    next();
  };
}
