import { z } from 'zod';

export const CategoryPolicySchema = z.object({
  category: z.string(), // "Palisade", "Tiles", "French Opus"
  customFieldOrder: z.array(z.string()).optional(),
  includePatternBreakdown: z.boolean().default(false),
  prefix: z.string().optional(),
  suffix: z.string().optional()
});

export const DescriptionRuleSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string(),
  companyName: z.string().default('Swamy Slabs Industries'),
  ruleVersion: z.number().int().default(1),
  fieldOrder: z.array(z.string()).default([
    'stone',
    'pattern',
    'size',
    'thickness',
    'topFinish',
    'edgeFinish',
    'finalFinish',
    'crateCount'
  ]),
  aliases: z.record(z.string(), z.string()).default({
    'Tandur Yellow Limestone': 'T.YELLOW',
    'T. Yellow': 'T.YELLOW',
    'Tandur Yellow': 'T.YELLOW',
    'Half Honed': 'H/H',
    'Tumbled': 'T/B',
    'Handcut': 'H/C',
    'Straight Handcut': 'H/C',
    'Brushed': 'BRUSHED',
    'Natural': 'NATURAL',
    'Palisade': 'PALISADE',
    'Tiles': 'TILES',
    'French Opus': 'FRENCH OPUS'
  }),
  categoryPolicies: z.array(CategoryPolicySchema).default([
    {
      category: 'French Opus',
      includePatternBreakdown: true
    }
  ]),
  crateSuffix: z.string().default('CRT'),
  unknownTermPolicy: z.enum(['review_required', 'passthrough']).default('review_required'),
  isApproved: z.boolean().default(true),
  approvedBy: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type DescriptionRule = z.infer<typeof DescriptionRuleSchema>;
export type CategoryPolicy = z.infer<typeof CategoryPolicySchema>;
