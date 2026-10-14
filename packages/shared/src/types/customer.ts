import { z } from 'zod';

export const CustomerAddressSchema = z.object({
  street: z.string().default(''),
  city: z.string(),
  state: z.string(),
  stateCode: z.string().length(2), // Indian GST state code
  postalCode: z.string(),
  country: z.string().default('India')
});

export const CustomerSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  name: z.string().min(2),
  shortCode: z.string().optional(),
  contactPerson: z.string().default(''),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().default(''),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid Indian GSTIN').optional().or(z.literal('')),
  billingAddress: CustomerAddressSchema,
  shippingAddress: CustomerAddressSchema,
  defaultCurrency: z.string().default('INR'),
  paymentTermsDays: z.number().int().default(30),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerAddress = z.infer<typeof CustomerAddressSchema>;
