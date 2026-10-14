import { Router, Request, Response } from 'express';
import { JobQueueService } from '../services/jobQueueService';
import { requireAuth } from '../middleware/auth';

export const jobRouter = Router();

// GET /api/jobs — All jobs for current tenant
jobRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, limit, skip } = req.query;
    const result = await JobQueueService.getJobsForTenant(req.tenantId!, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string) : 20,
      skip: skip ? parseInt(skip as string) : 0
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id — Single job
jobRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const job = await JobQueueService.getJob(req.params.id, req.tenantId!);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/retry — Retry a failed job
jobRouter.post('/:id/retry', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const newJobId = await JobQueueService.retryJob(req.params.id, req.tenantId!);
    res.json({ success: true, newJobId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
