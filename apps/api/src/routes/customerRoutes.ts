import { Router, Request, Response } from 'express';
import { CustomerService } from '../services/tenantScopedService';
import { requireAuth, requireRole } from '../middleware/auth';

export const customerRouter = Router();

// List all customers for current tenant
customerRouter.get(
  '/',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE', 'DISPATCH_STAFF']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customers = await CustomerService.listCustomers(req.tenantId!);
      res.json(customers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get single customer by ID
customerRouter.get(
  '/:id',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE', 'DISPATCH_STAFF']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await CustomerService.getCustomerById(req.tenantId!, req.params.id);
      res.json(customer);
    } catch (err: any) {
      const status = err.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// Create new customer (Owner & Accounts Executive only)
customerRouter.post(
  '/',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await CustomerService.createCustomer(
        req.tenantId!,
        req.body,
        { id: req.user!.id, email: req.user!.email }
      );
      res.status(201).json(customer);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update customer (Owner & Accounts Executive only)
customerRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await CustomerService.updateCustomer(
        req.tenantId!,
        req.params.id,
        req.body,
        { id: req.user!.id, email: req.user!.email }
      );
      res.json(customer);
    } catch (err: any) {
      const status = err.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// Delete customer (Owner ONLY)
customerRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['OWNER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await CustomerService.deleteCustomer(
        req.tenantId!,
        req.params.id,
        { id: req.user!.id, email: req.user!.email }
      );
      res.json({ success: true, message: 'Customer successfully deactivated.' });
    } catch (err: any) {
      const status = err.name === 'NotFoundError' ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  }
);

// Aggregation query (strictly tenant-scoped)
customerRouter.post(
  '/aggregate',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pipeline = Array.isArray(req.body.pipeline) ? req.body.pipeline : [];
      const results = await CustomerService.aggregateCustomers(req.tenantId!, pipeline);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
