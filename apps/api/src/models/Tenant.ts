import mongoose, { Schema, Document } from 'mongoose';
import { Tenant } from '@invoiceai/shared';

export interface TenantDocument extends Omit<Tenant, 'id'>, Document {}

const TenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    gstin: { type: String, required: true, uppercase: true, trim: true },
    phone: { type: String, default: '' },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: {
      street: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      stateCode: { type: String, required: true }, // e.g. "36" for Telangana / "29" for Karnataka
      postalCode: { type: String, required: true },
      country: { type: String, default: 'India' }
    },
    bankDetails: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
      branch: { type: String, default: '' }
    },
    invoiceSettings: {
      invoicePrefix: { type: String, default: 'INV' },
      financialYear: { type: String, default: '2026-27' },
      nextSequenceNumber: { type: Number, default: 1 },
      defaultHsnCode: { type: String, default: '6802' },
      defaultTaxRatePercent: { type: Number, default: 18 },
      paymentTermsDays: { type: Number, default: 30 }
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'ONBOARDING'],
      default: 'ACTIVE'
    }
  },
  { timestamps: true }
);

export const TenantModel = mongoose.model<TenantDocument>('Tenant', TenantSchema);
