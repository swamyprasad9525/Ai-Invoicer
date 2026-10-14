"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerSchema = exports.CustomerAddressSchema = void 0;
const zod_1 = require("zod");
exports.CustomerAddressSchema = zod_1.z.object({
    street: zod_1.z.string().default(''),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    stateCode: zod_1.z.string().length(2), // Indian GST state code
    postalCode: zod_1.z.string(),
    country: zod_1.z.string().default('India')
});
exports.CustomerSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    tenantId: zod_1.z.string(),
    name: zod_1.z.string().min(2),
    shortCode: zod_1.z.string().optional(),
    contactPerson: zod_1.z.string().default(''),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().default(''),
    gstin: zod_1.z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid Indian GSTIN').optional().or(zod_1.z.literal('')),
    billingAddress: exports.CustomerAddressSchema,
    shippingAddress: exports.CustomerAddressSchema,
    defaultCurrency: zod_1.z.string().default('INR'),
    paymentTermsDays: zod_1.z.number().int().default(30),
    notes: zod_1.z.string().optional(),
    isActive: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
