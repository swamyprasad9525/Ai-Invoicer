import { AuditLogModel } from '../models/AuditLog';
import { AuditAction } from '@invoiceai/shared';

export interface RecordAuditParams {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  description?: string;
  beforeSnapshot?: Record<string, any>;
  afterSnapshot?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAudit(params: RecordAuditParams): Promise<void> {
  try {
    await AuditLogModel.create(params);
  } catch (err) {
    console.error('[AUDIT] Failed to record audit log:', err);
  }
}
