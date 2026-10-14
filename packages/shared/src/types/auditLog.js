"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogSchema = exports.AuditActionSchema = void 0;
const zod_1 = require("zod");
exports.AuditActionSchema = zod_1.z.enum([
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
exports.AuditLogSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    tenantId: zod_1.z.string(),
    actorId: zod_1.z.string(),
    actorEmail: zod_1.z.string(),
    action: exports.AuditActionSchema,
    entityType: zod_1.z.string(),
    entityId: zod_1.z.string(),
    description: zod_1.z.string().default(''),
    beforeSnapshot: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    afterSnapshot: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    ipAddress: zod_1.z.string().optional(),
    userAgent: zod_1.z.string().optional(),
    createdAt: zod_1.z.date().optional()
});
