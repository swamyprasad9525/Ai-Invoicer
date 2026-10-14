import { z } from 'zod';

export const InvoiceStatusSchema = z.enum([
  'DRAFT',
  'NEEDS_REVIEW',
  'APPROVED',
  'ISSUED',
  'CANCELLED'
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceItemSchema = z.object({
  id: z.string().optional(),
  sourcePOItemId: z.string().optional(), // Invariant: Link to source PO item
  itemNumber: z.number().int(),
  hsnCode: z.string().default('6802'),
  description: z.string(), // Commercial description generated via Rule Engine
  patternBreakdown: z.string().optional().default(''),
  orderedQuantity: z.string(), // Decimal string
  previouslyInvoicedQuantity: z.string().default('0.00'),
  dispatchedQuantity: z.string(), // Decimal string confirmed by dispatch/user
  remainingQuantity: z.string().default('0.00'),
  unit: z.string().default('SQM'),
  rate: z.string(), // Decimal string
  discount: z.string().default('0.00'),
  amount: z.string(), // Decimal string (dispatchedQuantity * rate - discount)
  crateCount: z.number().int().default(0),
  ruleVersionUsed: z.number().int().default(1),
  isManuallyEdited: z.boolean().default(false)
});

export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;

export const InvoiceSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  purchaseOrderId: z.string(),
  customerId: z.string(),
  invoiceNumber: z.string(), // e.g. "INV/2026-27/0001" or "DRAFT-POM14356A"
  invoiceDate: z.string(), // ISO date "2026-09-10"
  dueDate: z.string().optional(),
  vehicleNumber: z.string().default(''),
  lrNumber: z.string().default(''),
  placeOfSupplyStateCode: z.string().length(2),
  isInterState: z.boolean(),
  subtotal: z.string(), // Decimal string
  taxRatePercent: z.number().default(18),
  cgstRatePercent: z.number().default(9),
  cgstAmount: z.string().default('0.00'),
  sgstRatePercent: z.number().default(9),
  sgstAmount: z.string().default('0.00'),
  igstRatePercent: z.number().default(18),
  igstAmount: z.string().default('0.00'),
  totalTaxAmount: z.string(),
  roundOff: z.string().default('0.00'),
  grandTotal: z.string(), // Decimal string
  grandTotalWords: z.string().default(''),
  totalCrates: z.number().int().default(0),
  status: InvoiceStatusSchema.default('DRAFT'),
  items: z.array(InvoiceItemSchema).default([]),
  templateId: z.string().optional(),
  templateVersionUsed: z.number().int().default(1),
  immutableIssuedSnapshot: z.record(z.string(), z.any()).optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  issuedAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Invoice = z.infer<typeof InvoiceSchema>;
