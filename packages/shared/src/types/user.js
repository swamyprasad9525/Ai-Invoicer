"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSchema = exports.UserMembershipSchema = exports.UserRoleSchema = void 0;
const zod_1 = require("zod");
exports.UserRoleSchema = zod_1.z.enum([
    'OWNER_ADMIN',
    'ACCOUNTS_EXECUTIVE',
    'DISPATCH_STAFF',
    'SAAS_OPERATOR'
]);
exports.UserMembershipSchema = zod_1.z.object({
    tenantId: zod_1.z.string(),
    role: exports.UserRoleSchema,
    permissions: zod_1.z.array(zod_1.z.string()).default([])
});
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    passwordHash: zod_1.z.string().optional(),
    memberships: zod_1.z.array(exports.UserMembershipSchema).default([]),
    isActive: zod_1.z.boolean().default(true),
    lastLoginAt: zod_1.z.date().optional(),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
