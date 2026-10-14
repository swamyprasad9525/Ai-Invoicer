import { z } from 'zod';

export const AuditActionSchema = z.enum([
  'USER_LOGIN',
  'TENANT_UPDATED',
  'CUSTOMER_CREATED',
  'CUSTOMER_UPDATED',
  'PO_UPLOADED',
  'AI_EXTRACTION_STARTED',
  'AI_EXTRACTION_COMPLETED',
  'AI_EXTRACTION_FAILED',
  'PO_ITEM_CORRECTED',
  'RULE_CREATED',
  'RULE_UPDATED',
  'DRAFT_GENERATED',
  'DISPATCH_CONFIRMED',
  'INVOICE_VALIDATED',
  'INVOICE_APPROVED',
  'INVOICE_ISSUED',
  'TEMPLATE_UPLOADED'
]);

export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  actorId: z.string(),
  actorEmail: z.string(),
  action: AuditActionSchema,
  entityType: z.string(),
  entityId: z.string(),
  description: z.string().default(''),
  beforeSnapshot: z.record(z.string(), z.any()).optional(),
  afterSnapshot: z.record(z.string(), z.any()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  createdAt: z.date().optional()
});

export type AuditLog = z.infer<typeof AuditLogSchema>;
