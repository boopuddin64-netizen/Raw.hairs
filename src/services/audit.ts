import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

export interface AuditLogInput {
  actorUid: string;
  actorEmail?: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput) {
  await db.insert(auditLogs).values({
    actorUid: input.actorUid,
    actorEmail: input.actorEmail || null,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    details: input.details || {},
  });
}
