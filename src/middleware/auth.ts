import type { NextFunction, Request, Response } from 'express';
import { asc, eq, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { isSupabaseAdminConfigured, supabaseAdmin } from '../lib/supabase-admin.ts';
import { db } from '../db/index.ts';
import { bookings, deliveries, orders, quotations, returns, users } from '../db/schema.ts';

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

export interface VerifiedAuthIdentity {
  uid: string;
  email?: string;
  name?: string;
  provider: 'supabase' | 'firebase';
}

export interface AuthRequest extends Request {
  user?: VerifiedAuthIdentity;
  dbUser?: DbUserRecord;
}

export async function syncAuthUser(identity: VerifiedAuthIdentity): Promise<DbUserRecord> {
  const cleanEmail = (identity.email || '').trim().toLowerCase();

  // 1. Match directly by UID
  const existingByUid = await db
    .select()
    .from(users)
    .where(eq(users.uid, identity.uid))
    .limit(1);

  if (existingByUid.length > 0) {
    const current = existingByUid[0];
    if (cleanEmail === OWNER_ADMIN_EMAIL && current.role !== 'owneradmin') {
      const [updated] = await db
        .update(users)
        .set({ role: 'owneradmin', email: cleanEmail || current.email, updatedAt: new Date() })
        .where(eq(users.uid, identity.uid))
        .returning();
      return updated as unknown as DbUserRecord;
    }
    return current as unknown as DbUserRecord;
  }

  // 2. Match by email (links seeded accounts like boopuddin64@gmail.com or riders across Auth UID transitions)
  if (cleanEmail) {
    const existingByEmail = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${cleanEmail})`)
      .orderBy(asc(users.id))
      .limit(1);

    if (existingByEmail.length > 0) {
      const current = existingByEmail[0];
      const oldUid = current.uid;
      const nextRole = cleanEmail === OWNER_ADMIN_EMAIL ? 'owneradmin' : current.role;

      const [relinked] = await db.transaction(async (tx) => {
        const updatedRows = await tx
          .update(users)
          .set({
            uid: identity.uid,
            email: cleanEmail,
            fullName: current.fullName || identity.name || null,
            role: nextRole,
            updatedAt: new Date(),
          })
          .where(eq(users.id, current.id))
          .returning();

        if (oldUid && oldUid !== identity.uid) {
          await tx.update(orders).set({ userUid: identity.uid }).where(eq(orders.userUid, oldUid));
          await tx.update(orders).set({ assignedRiderUid: identity.uid }).where(eq(orders.assignedRiderUid, oldUid));
          await tx.update(deliveries).set({ assignedRiderUid: identity.uid }).where(eq(deliveries.assignedRiderUid, oldUid));
          await tx.update(bookings).set({ userUid: identity.uid }).where(eq(bookings.userUid, oldUid));
          await tx.update(quotations).set({ userUid: identity.uid }).where(eq(quotations.userUid, oldUid));
          await tx.update(returns).set({ userUid: identity.uid }).where(eq(returns.userUid, oldUid));
        }

        return updatedRows;
      });

      return relinked as unknown as DbUserRecord;
    }
  }

  // 3. Create new customer (or owneradmin if founder email)
  const assignedRole = cleanEmail === OWNER_ADMIN_EMAIL ? 'owneradmin' : 'customer';
  const [created] = await db
    .insert(users)
    .values({
      uid: identity.uid,
      email: cleanEmail || `${identity.uid}@user.rawhairs.local`,
      fullName: identity.name || null,
      role: assignedRole,
      defaultState: 'Rivers',
      defaultZone: 'ph-gra',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: cleanEmail || `${identity.uid}@user.rawhairs.local`,
        updatedAt: new Date(),
      },
    })
    .returning();

  return created as unknown as DbUserRecord;
}

async function verifyBearerToken(token: string): Promise<VerifiedAuthIdentity> {
  if (isSupabaseAdminConfigured && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new Error(error?.message || 'Invalid Supabase token.');
    }
    const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      undefined;
    return {
      uid: data.user.id,
      email: data.user.email || undefined,
      name: fullName,
      provider: 'supabase',
    };
  }

  const decoded = await adminAuth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    provider: 'firebase',
  };
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
      const identity = await verifyBearerToken(token);
      req.user = identity;
      req.dbUser = await syncAuthUser(identity);
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
    const identity = await verifyBearerToken(token);
    req.user = identity;
    req.dbUser = await syncAuthUser(identity);
    if (!req.dbUser.isActive) {
      return res.status(403).json({ error: 'This account is currently suspended.' });
    }
    return next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
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
