import mongoose, { Schema, Document } from 'mongoose';
import { PurchaseOrder, POItem } from '@invoiceai/shared';

export interface PurchaseOrderDocument extends Omit<PurchaseOrder, 'id'>, Document {}

const POItemSchema = new Schema(
  {
    line: { type: Number, required: true },
    material: { type: String, default: '' },
    category: { type: String, default: '' },
    size: { type: String, default: '' },
    thickness: { type: String, default: '' },
    topFinish: [{ type: String }],
    bottomFinish: [{ type: String }],
    edgeFinish: [{ type: String }],
    finalFinish: [{ type: String }],
    patternBreakdown: { type: String, default: '' },
    crateCount: { type: Number, default: 0 },
    orderedQuantity: { type: String, required: true },
    unit: { type: String, default: 'SQM' },
    rate: { type: String, required: true },
    poLineTotal: { type: String, required: true },
    sourcePage: { type: Number, default: 1 },
    confidence: { type: Number, default: 1.0 },
    reviewFlags: [{ type: String }],
    rawSnippet: { type: String }
  },
  { _id: true }
);

const PurchaseOrderSchema = new Schema<PurchaseOrderDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId as any, ref: 'Customer' },
    sourceFileId: { type: String, required: true },
    fileHash: { type: String, required: true },
    originalFileName: { type: String, required: true },
    poNumber: { type: String, required: true, trim: true },
    poDate: { type: String, required: true },
    currency: { type: String, default: 'INR' },
    buyerName: { type: String, required: true },
    poGoodsTotal: { type: String, required: true },
    status: {
      type: String,
      enum: ['UPLOADED', 'EXTRACTING', 'EXTRACTED', 'DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'EXTRACTION_FAILED'],
      default: 'UPLOADED',
      index: true
    },
    items: [POItemSchema],
    warnings: [{ type: String }],
    version: { type: Number, default: 1 }
  },
  { timestamps: true }
);

PurchaseOrderSchema.index({ tenantId: 1, poNumber: 1 });
PurchaseOrderSchema.index({ tenantId: 1, fileHash: 1 });

export const PurchaseOrderModel = mongoose.model<PurchaseOrderDocument>('PurchaseOrder', PurchaseOrderSchema);
