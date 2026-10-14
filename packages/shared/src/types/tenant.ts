import { z } from 'zod';

export const TenantAddressSchema = z.object({
  street: z.string().default(''),
  city: z.string(),
  state: z.string(),
  stateCode: z.string().length(2), // 2-digit Indian GST State code (e.g., '29' for Karnataka, '36' for Telangana)
  postalCode: z.string(),
  country: z.string().default('India')
});

export const BankDetailsSchema = z.object({
  bankName: z.string(),
  accountNumber: z.string(),
  ifscCode: z.string(),
  branch: z.string().default('')
});

export const TenantInvoiceSettingsSchema = z.object({
  invoicePrefix: z.string().default('INV'),
  financialYear: z.string().default('2026-27'),
  nextSequenceNumber: z.number().int().default(1),
  defaultHsnCode: z.string().default('6802'), // Stone / Granite / Marble
  defaultTaxRatePercent: z.number().default(18), // 18% standard GST on natural stone
  paymentTermsDays: z.number().int().default(30)
});

export const TenantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  slug: z.string().min(2),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid Indian GSTIN'),
  phone: z.string().default(''),
  email: z.string().email(),
  address: TenantAddressSchema,
  bankDetails: BankDetailsSchema,
  invoiceSettings: TenantInvoiceSettingsSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING']).default('ACTIVE'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Tenant = z.infer<typeof TenantSchema>;
export type TenantAddress = z.infer<typeof TenantAddressSchema>;
export type BankDetails = z.infer<typeof BankDetailsSchema>;
export type TenantInvoiceSettings = z.infer<typeof TenantInvoiceSettingsSchema>;
