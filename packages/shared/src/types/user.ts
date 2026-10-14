import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'OWNER_ADMIN',
  'ACCOUNTS_EXECUTIVE',
  'DISPATCH_STAFF',
  'SAAS_OPERATOR'
]);

export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserMembershipSchema = z.object({
  tenantId: z.string(),
  role: UserRoleSchema,
  permissions: z.array(z.string()).default([])
});

export const UserSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  passwordHash: z.string().optional(),
  memberships: z.array(UserMembershipSchema).default([]),
  isActive: z.boolean().default(true),
  lastLoginAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type User = z.infer<typeof UserSchema>;
export type UserMembership = z.infer<typeof UserMembershipSchema>;
