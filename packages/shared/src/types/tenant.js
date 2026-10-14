"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantSchema = exports.TenantInvoiceSettingsSchema = exports.BankDetailsSchema = exports.TenantAddressSchema = void 0;
const zod_1 = require("zod");
exports.TenantAddressSchema = zod_1.z.object({
    street: zod_1.z.string().default(''),
    city: zod_1.z.string(),
    state: zod_1.z.string(),
    stateCode: zod_1.z.string().length(2), // 2-digit Indian GST State code (e.g., '29' for Karnataka, '36' for Telangana)
    postalCode: zod_1.z.string(),
    country: zod_1.z.string().default('India')
});
exports.BankDetailsSchema = zod_1.z.object({
    bankName: zod_1.z.string(),
    accountNumber: zod_1.z.string(),
    ifscCode: zod_1.z.string(),
    branch: zod_1.z.string().default('')
});
exports.TenantInvoiceSettingsSchema = zod_1.z.object({
    invoicePrefix: zod_1.z.string().default('INV'),
    financialYear: zod_1.z.string().default('2026-27'),
    nextSequenceNumber: zod_1.z.number().int().default(1),
    defaultHsnCode: zod_1.z.string().default('6802'), // Stone / Granite / Marble
    defaultTaxRatePercent: zod_1.z.number().default(18), // 18% standard GST on natural stone
    paymentTermsDays: zod_1.z.number().int().default(30)
});
exports.TenantSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(2),
    slug: zod_1.z.string().min(2),
    gstin: zod_1.z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid Indian GSTIN'),
    phone: zod_1.z.string().default(''),
    email: zod_1.z.string().email(),
    address: exports.TenantAddressSchema,
    bankDetails: exports.BankDetailsSchema,
    invoiceSettings: exports.TenantInvoiceSettingsSchema,
    status: zod_1.z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING']).default('ACTIVE'),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
