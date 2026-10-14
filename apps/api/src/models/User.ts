import mongoose, { Schema, Document } from 'mongoose';
import { User, UserRole } from '@invoiceai/shared';

export interface UserDocument extends Omit<User, 'id'>, Document {}

const MembershipSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    role: {
      type: String,
      enum: ['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE', 'DISPATCH_STAFF', 'SAAS_OPERATOR'],
      required: true
    },
    permissions: [{ type: String }]
  },
  { _id: false }
);

const UserSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    memberships: [MembershipSchema],
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<UserDocument>('User', UserSchema);
