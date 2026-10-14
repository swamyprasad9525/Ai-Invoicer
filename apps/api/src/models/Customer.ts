import mongoose, { Schema, Document } from 'mongoose';
import { Customer } from '@invoiceai/shared';

export interface CustomerDocument extends Omit<Customer, 'id'>, Document {}

const AddressSchema = new Schema(
  {
    street: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    stateCode: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, default: 'India' }
  },
  { _id: false }
);

const CustomerSchema = new Schema<CustomerDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    shortCode: { type: String, trim: true },
    contactPerson: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '' },
    gstin: { type: String, default: '', uppercase: true, trim: true },
    billingAddress: { type: AddressSchema, required: true },
    shippingAddress: { type: AddressSchema, required: true },
    defaultCurrency: { type: String, default: 'INR' },
    paymentTermsDays: { type: Number, default: 30 },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

CustomerSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const CustomerModel = mongoose.model<CustomerDocument>('Customer', CustomerSchema);
