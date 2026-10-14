import mongoose, { Schema, Document } from 'mongoose';
import { Invoice, InvoiceItem } from '@invoiceai/shared';

export interface InvoiceDocument extends Omit<Invoice, 'id'>, Document {}

const InvoiceItemSchema = new Schema(
  {
    sourcePOItemId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder.items' },
    itemNumber: { type: Number, required: true },
    hsnCode: { type: String, default: '6802' },
    description: { type: String, required: true },
    patternBreakdown: { type: String, default: '' },
    orderedQuantity: { type: String, required: true },
    previouslyInvoicedQuantity: { type: String, default: '0.00' },
    dispatchedQuantity: { type: String, required: true },
    remainingQuantity: { type: String, default: '0.00' },
    unit: { type: String, default: 'SQM' },
    rate: { type: String, required: true },
    discount: { type: String, default: '0.00' },
    amount: { type: String, required: true },
    crateCount: { type: Number, default: 0 },
    ruleVersionUsed: { type: Number, default: 1 },
    isManuallyEdited: { type: Boolean, default: false }
  },
  { _id: true }
);

const InvoiceSchema = new Schema<InvoiceDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    purchaseOrderId: { type: Schema.Types.ObjectId as any, ref: 'PurchaseOrder', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId as any, ref: 'Customer', required: true },
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: String, required: true },
    dueDate: { type: String },
    vehicleNumber: { type: String, default: '' },
    lrNumber: { type: String, default: '' },
    placeOfSupplyStateCode: { type: String, required: true },
    isInterState: { type: Boolean, required: true },
    subtotal: { type: String, required: true },
    taxRatePercent: { type: Number, default: 18 },
    cgstRatePercent: { type: Number, default: 9 },
    cgstAmount: { type: String, default: '0.00' },
    sgstRatePercent: { type: Number, default: 9 },
    sgstAmount: { type: String, default: '0.00' },
    igstRatePercent: { type: Number, default: 18 },
    igstAmount: { type: String, default: '0.00' },
    totalTaxAmount: { type: String, required: true },
    roundOff: { type: String, default: '0.00' },
    grandTotal: { type: String, required: true },
    grandTotalWords: { type: String, default: '' },
    totalCrates: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'NEEDS_REVIEW', 'APPROVED', 'ISSUED', 'CANCELLED'],
      default: 'DRAFT',
      index: true
    },
    templateId: { type: String },
    templateVersionUsed: { type: Number, default: 1 },
    immutableIssuedSnapshot: { type: Schema.Types.Mixed },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    issuedAt: { type: Date }
  },
  { timestamps: true }
);

InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 });

export const InvoiceModel = mongoose.model<InvoiceDocument>('Invoice', InvoiceSchema);
