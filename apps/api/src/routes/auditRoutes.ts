import { Router, Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { requireAuth } from '../middleware/auth';

export const auditRouter = Router();

auditRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await AuditLogModel.find({ tenantId: req.tenantId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
