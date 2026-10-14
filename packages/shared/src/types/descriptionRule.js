"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DescriptionRuleSchema = exports.CategoryPolicySchema = void 0;
const zod_1 = require("zod");
exports.CategoryPolicySchema = zod_1.z.object({
    category: zod_1.z.string(), // "Palisade", "Tiles", "French Opus"
    customFieldOrder: zod_1.z.array(zod_1.z.string()).optional(),
    includePatternBreakdown: zod_1.z.boolean().default(false),
    prefix: zod_1.z.string().optional(),
    suffix: zod_1.z.string().optional()
});
exports.DescriptionRuleSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    tenantId: zod_1.z.string(),
    companyName: zod_1.z.string().default('Swamy Slabs Industries'),
    ruleVersion: zod_1.z.number().int().default(1),
    fieldOrder: zod_1.z.array(zod_1.z.string()).default([
        'stone',
        'pattern',
        'size',
        'thickness',
        'topFinish',
        'edgeFinish',
        'finalFinish',
        'crateCount'
    ]),
    aliases: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({
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
    categoryPolicies: zod_1.z.array(exports.CategoryPolicySchema).default([
        {
            category: 'French Opus',
            includePatternBreakdown: true
        }
    ]),
    crateSuffix: zod_1.z.string().default('CRT'),
    unknownTermPolicy: zod_1.z.enum(['review_required', 'passthrough']).default('review_required'),
    isApproved: zod_1.z.boolean().default(true),
    approvedBy: zod_1.z.string().optional(),
    createdAt: zod_1.z.date().optional(),
    updatedAt: zod_1.z.date().optional()
});
