import { z } from 'zod';

export const POStatusSchema = z.enum([
  'UPLOADED',
  'EXTRACTING',
  'EXTRACTED',
  'DRAFT',
  'NEEDS_REVIEW',
  'APPROVED',
  'ISSUED',
  'EXTRACTION_FAILED'
]);

export type POStatus = z.infer<typeof POStatusSchema>;

export const POItemSchema = z.object({
  id: z.string().optional(),
  line: z.number().int(),
  material: z.string().default(''), // e.g. "Tandur Yellow Limestone"
  category: z.string().default(''), // e.g. "Palisade", "Tiles", "French Opus"
  size: z.string().default(''), // e.g. "100x50 CM"
  thickness: z.string().default(''), // e.g. "3-5 CM"
  topFinish: z.array(z.string()).default([]), // e.g. ["Natural"]
  bottomFinish: z.array(z.string()).default([]), // e.g. ["Natural", "Calibrated"]
  edgeFinish: z.array(z.string()).default([]), // e.g. ["Straight Handcut"]
  finalFinish: z.array(z.string()).default([]), // e.g. ["Brushed", "Tumbled"]
  patternBreakdown: z.string().optional().default(''), // e.g. "20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC"
  crateCount: z.number().int().default(0),
  orderedQuantity: z.string(), // Decimal string e.g. "33.00"
  unit: z.string().default('SQM'),
  rate: z.string(), // Decimal string e.g. "1150.00"
  poLineTotal: z.string(), // Decimal string e.g. "37950.00"
  sourcePage: z.number().int().default(1),
  confidence: z.number().min(0).max(1).default(1.0),
  reviewFlags: z.array(z.string()).default([]),
  rawSnippet: z.string().optional()
});

export type POItem = z.infer<typeof POItemSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  customerId: z.string().optional(),
  sourceFileId: z.string(),
  fileHash: z.string(), // SHA-256
  originalFileName: z.string(),
  poNumber: z.string(), // e.g. "POM14356A"
  poDate: z.string(), // e.g. "2026-09-09"
  currency: z.string().default('INR'),
  buyerName: z.string(),
  poGoodsTotal: z.string(), // Decimal string e.g. "197880.00"
  status: POStatusSchema.default('UPLOADED'),
  items: z.array(POItemSchema).default([]),
  warnings: z.array(z.string()).default([]),
  version: z.number().int().default(1),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
