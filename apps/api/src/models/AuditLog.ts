import mongoose, { Schema, Document } from 'mongoose';
import { AuditLog } from '@invoiceai/shared';

export interface AuditLogDocument extends Omit<AuditLog, 'id'>, Document {}

const AuditLogSchema = new Schema<AuditLogDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    actorId: { type: String, required: true },
    actorEmail: { type: String, required: true },
    action: {
      type: String,
      required: true,
      index: true
    },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    description: { type: String, default: '' },
    beforeSnapshot: { type: Schema.Types.Mixed },
    afterSnapshot: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLogModel = mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
