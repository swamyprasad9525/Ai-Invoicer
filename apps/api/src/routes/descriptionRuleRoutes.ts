import { Router, Request, Response } from 'express';
import { DescriptionRuleModel } from '../models/DescriptionRule';
import { DescriptionRuleEngine } from '../services/ruleEngine';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit } from '../services/auditService';

export const descriptionRuleRouter = Router();

descriptionRuleRouter.get('/current', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rule = await DescriptionRuleModel.findOne({ tenantId: req.tenantId }).sort({ ruleVersion: -1 });
    if (!rule) {
      res.status(404).json({ error: 'No description rules found for this tenant.' });
      return;
    }
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

descriptionRuleRouter.post('/test-transform', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { item, rule: customRule } = req.body;
    let rule = customRule;
    if (!rule) {
      rule = await DescriptionRuleModel.findOne({ tenantId: req.tenantId }).sort({ ruleVersion: -1 });
    }

    if (!rule) {
      res.status(400).json({ error: 'No rule configuration available to test.' });
      return;
    }

    const result = DescriptionRuleEngine.transform(item, rule);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

descriptionRuleRouter.post('/', requireAuth, requireRole(['OWNER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const latestRule = await DescriptionRuleModel.findOne({ tenantId: req.tenantId }).sort({ ruleVersion: -1 });
    const nextVersion = (latestRule?.ruleVersion || 0) + 1;

    const newRule = await DescriptionRuleModel.create({
      tenantId: req.tenantId,
      companyName: req.body.companyName || 'Swamy Slabs Industries',
      ruleVersion: nextVersion,
      fieldOrder: req.body.fieldOrder,
      aliases: req.body.aliases,
      categoryPolicies: req.body.categoryPolicies,
      crateSuffix: req.body.crateSuffix || 'CRT',
      unknownTermPolicy: req.body.unknownTermPolicy || 'review_required',
      isApproved: true,
      approvedBy: req.user!.email
    });

    await recordAudit({
      tenantId: req.tenantId!,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'RULE_CREATED',
      entityType: 'DESCRIPTION_RULE',
      entityId: newRule._id.toString(),
      description: `Created Description Rule version ${nextVersion}`,
      afterSnapshot: newRule.toObject()
    });

    res.status(201).json(newRule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
