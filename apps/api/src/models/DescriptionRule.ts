import mongoose, { Schema, Document } from 'mongoose';
import { DescriptionRule } from '@invoiceai/shared';

export interface DescriptionRuleDocument extends Omit<DescriptionRule, 'id'>, Document {}

const CategoryPolicySchema = new Schema(
  {
    category: { type: String, required: true },
    customFieldOrder: [{ type: String }],
    includePatternBreakdown: { type: Boolean, default: false },
    prefix: { type: String },
    suffix: { type: String }
  },
  { _id: false }
);

const DescriptionRuleSchema = new Schema<DescriptionRuleDocument>(
  {
    tenantId: { type: Schema.Types.ObjectId as any, ref: 'Tenant', required: true, index: true },
    companyName: { type: String, default: 'Swamy Slabs Industries' },
    ruleVersion: { type: Number, default: 1 },
    fieldOrder: [{ type: String }],
    aliases: { type: Schema.Types.Mixed, default: {} },
    categoryPolicies: [CategoryPolicySchema],
    crateSuffix: { type: String, default: 'CRT' },
    unknownTermPolicy: {
      type: String,
      enum: ['review_required', 'passthrough'],
      default: 'review_required'
    },
    isApproved: { type: Boolean, default: true },
    approvedBy: { type: String }
  },
  { timestamps: true }
);

DescriptionRuleSchema.index({ tenantId: 1, ruleVersion: -1 });

export const DescriptionRuleModel = mongoose.model<DescriptionRuleDocument>('DescriptionRule', DescriptionRuleSchema);
