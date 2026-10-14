"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceSchema = exports.InvoiceItemSchema = exports.InvoiceStatusSchema = void 0;
const zod_1 = require("zod");
exports.InvoiceStatusSchema = zod_1.z.enum([
    'DRAFT',
    'NEEDS_REVIEW',
    'APPROVED',
    'ISSUED',
    'CANCELLED'
]);
exports.InvoiceItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    sourcePOItemId: zod_1.z.string().optional(), // Invariant: Link to source PO item
    itemNumber: zod_1.z.number().int(),
    hsnCode: zod_1.z.string().default('6802'),
    description: zod_1.z.string(), // Commercial description generated via Rule Engine
    patternBreakdown: zod_1.z.string().optional().default(''),
    orderedQuantity: zod_1.z.string(), // Decimal string
    previouslyInvoicedQuantity: zod_1.z.string().default('0.00'),
    dispatchedQuantity: zod_1.z.string(), // Decimal string confirmed by dispatch/user
    remainingQuantity: zod_1.z.string().default('0.00'),
    unit: zod_1.z.string().default('SQM'),
    rate: zod_1.z.string(), // Decimal string
    discount: zod_1.z.string().default('0.00'),
    amount: zod_1.z.string(), // Decimal string (dispatchedQuantity * rate - discount)
    crateCount: zod_1.z.number().int().default(0),
    ruleVersionUsed: zod_1.z.number().int().default(1),
    isManuallyEdited: zod_1.z.boolean().default(false)
});
exports.InvoiceSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    tenantId: zod_1.z.string(),
    purchaseOrderId: zod_1.z.string(),
    customerId: zod_1.z.string(),
    invoiceNumber: zod_1.z.string(), // e.g. "INV/2026-27/0001" or "DRAFT-POM14356A"
    invoiceDate: zod_1.z.string(), // ISO date "2026-09-10"
    dueDate: zod_1.z.string().optional(),
    vehicleNumber: zod_1.z.string().default(''),
    lrNumber: zod_1.z.string().default(''),
    placeOfSupplyStateCode: zod_1.z.string().length(2),
    isInterState: zod_1.z.boolean(),
    subtotal: zod_1.z.string(), // Decimal string
    taxRatePercent: zod_1.z.number().default(18),
    cgstRatePercent: zod_1.z.number().default(9),
    cgstAmount: zod_1.z.string().default('0.00'),
    sgstRatePercent: zod_1.z.number().default(9),
    sgstAmount: zod_1.z.string().default('0.00'),
    igstRatePercent: zod_1.z.number().default(18),
    igstAmount: zod_1.z.string().default('0.00'),
    totalTaxAmount: zod_1.z.string(),
    roundOff: zod_1.z.string().default('0.00'),
    grandTotal: zod_1.z.string(), // Decimal string
    grandTotalWords: zod_1.z.string().default(''),
    totalCrates: zod_1.z.number().int().default(0),
    status: exports.InvoiceStatusSchema.default('DRAFT'),
    templateId: zod_1.z.string().optional(),
    templateVersionUsed: zod_1.z.number().int().default(1),
    immutableIssuedSnapshot: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    approvedBy: zod_1.z.string().optional(),
    approvedAt: zod_1.z.date().optional(),
    issuedAt: zod_1.z.date().optional(),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
