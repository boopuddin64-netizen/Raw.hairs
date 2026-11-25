import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

const OWNER_ADMIN_EMAIL = 'boopuddin64@gmail.com';

export interface DbUserRecord {
  id: number;
  uid: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  permissions: Record<string, boolean> | null;
  defaultState: string | null;
  defaultZone: string | null;
  defaultAddress: string | null;
  isActive: boolean;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUserRecord;
}

export async function syncFirebaseUser(decoded: DecodedIdToken): Promise<DbUserRecord> {
  const email = (decoded.email || '').toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    if (email === OWNER_ADMIN_EMAIL && current.role !== 'owneradmin') {
      const [updated] = await db
        .update(users)
        .set({ role: 'owneradmin', email: decoded.email || current.email, updatedAt: new Date() })
        .where(eq(users.uid, decoded.uid))
        .returning();
      return updated as unknown as DbUserRecord;
    }
    return current as unknown as DbUserRecord;
  }

  const assignedRole = email === OWNER_ADMIN_EMAIL ? 'owneradmin' : 'customer';
  const [created] = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@user.rawhairs.local`,
      fullName: decoded.name || null,
      role: assignedRole,
      defaultState: 'Rivers',
      defaultZone: 'ph-gra',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: decoded.email || `${decoded.uid}@user.rawhairs.local`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return created as unknown as DbUserRecord;
}

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.user = decoded;
      req.dbUser = await syncFirebaseUser(decoded);
    } catch {
      // Guest fallback permitted on optional routes
    }
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    req.dbUser = await syncFirebaseUser(decoded);
    if (!req.dbUser.isActive) {
      return res.status(403).json({ error: 'This account is currently suspended.' });
    }
    return next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.dbUser.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this workspace.' });
    }
    return next();
  };
};
