"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseOrderSchema = exports.POItemSchema = exports.POStatusSchema = void 0;
const zod_1 = require("zod");
exports.POStatusSchema = zod_1.z.enum([
    'UPLOADED',
    'EXTRACTING',
    'EXTRACTED',
    'DRAFT',
    'NEEDS_REVIEW',
    'APPROVED',
    'ISSUED',
    'EXTRACTION_FAILED'
]);
exports.POItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    line: zod_1.z.number().int(),
    material: zod_1.z.string().default(''), // e.g. "Tandur Yellow Limestone"
    category: zod_1.z.string().default(''), // e.g. "Palisade", "Tiles", "French Opus"
    size: zod_1.z.string().default(''), // e.g. "100x50 CM"
    thickness: zod_1.z.string().default(''), // e.g. "3-5 CM"
    topFinish: zod_1.z.array(zod_1.z.string()).default([]), // e.g. ["Natural"]
    bottomFinish: zod_1.z.array(zod_1.z.string()).default([]), // e.g. ["Natural", "Calibrated"]
    edgeFinish: zod_1.z.array(zod_1.z.string()).default([]), // e.g. ["Straight Handcut"]
    finalFinish: zod_1.z.array(zod_1.z.string()).default([]), // e.g. ["Brushed", "Tumbled"]
    patternBreakdown: zod_1.z.string().optional().default(''), // e.g. "20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC"
    crateCount: zod_1.z.number().int().default(0),
    orderedQuantity: zod_1.z.string(), // Decimal string e.g. "33.00"
    unit: zod_1.z.string().default('SQM'),
    rate: zod_1.z.string(), // Decimal string e.g. "1150.00"
    poLineTotal: zod_1.z.string(), // Decimal string e.g. "37950.00"
    sourcePage: zod_1.z.number().int().default(1),
    confidence: zod_1.z.number().min(0).max(1).default(1.0),
    reviewFlags: zod_1.z.array(zod_1.z.string()).default([]),
    rawSnippet: zod_1.z.string().optional()
});
exports.PurchaseOrderSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    tenantId: zod_1.z.string(),
    customerId: zod_1.z.string().optional(),
    sourceFileId: zod_1.z.string(),
    fileHash: zod_1.z.string(), // SHA-256
    originalFileName: zod_1.z.string(),
    poNumber: zod_1.z.string(), // e.g. "POM14356A"
    poDate: zod_1.z.string(), // e.g. "2026-09-09"
    currency: zod_1.z.string().default('INR'),
    buyerName: zod_1.z.string(),
    poGoodsTotal: zod_1.z.string(), // Decimal string e.g. "197880.00"
    status: exports.POStatusSchema.default('UPLOADED'),
    items: zod_1.z.array(exports.POItemSchema).default([]),
    warnings: zod_1.z.array(zod_1.z.string()).default([]),
    version: zod_1.z.number().int().default(1),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
