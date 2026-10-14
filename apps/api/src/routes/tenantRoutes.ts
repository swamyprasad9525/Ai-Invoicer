import { Router, Request, Response } from 'express';
import { TenantService } from '../services/tenantScopedService';
import { UserModel } from '../models/User';
import { requireAuth, requireRole, generateToken, setSessionCookie } from '../middleware/auth';

export const tenantRouter = Router();

// Create new company workspace
tenantRouter.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, slug, gstin, phone, email, address, bankDetails } = req.body;

    if (!name || !gstin || !address || !address.city || !address.state || !address.stateCode || !address.postalCode) {
      res.status(400).json({ error: 'Company name, GSTIN, and full address (city, state, stateCode, postalCode) are required.' });
      return;
    }

    const { tenant, role } = await TenantService.createTenantWorkspace({
      name,
      slug,
      gstin,
      phone,
      email: email || req.user!.email,
      address,
      bankDetails,
      creatorUserId: req.user!.id
    });

    // Switch session to newly created tenant
    const tokenPayload = {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      tenantId: tenant._id.toString(),
      role,
      permissions: ['*']
    };

    const token = generateToken(tokenPayload);
    setSessionCookie(res, token);

    res.status(201).json({
      tenant,
      role,
      token
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get current active tenant profile
tenantRouter.get('/current', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenant = await TenantService.getTenantById(req.tenantId!);
    res.json(tenant);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Update active tenant profile (OWNER_ADMIN only)
tenantRouter.patch('/current', requireAuth, requireRole(['OWNER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await TenantService.updateTenantProfile(
      req.tenantId!,
      req.body,
      { id: req.user!.id, email: req.user!.email }
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// List all company workspaces the authenticated user belongs to
tenantRouter.get('/my-memberships', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberships = await TenantService.getUserMemberships(req.user!.id);
    res.json(memberships);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Switch active workspace
tenantRouter.post('/switch/:tenantId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const targetTenantId = req.params.tenantId;
    const user = await UserModel.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const membership = user.memberships.find((m) => m.tenantId.toString() === targetTenantId);
    if (!membership) {
      res.status(403).json({ error: 'Access denied: You are not a member of this company workspace.' });
      return;
    }

    const tenant = await TenantService.getTenantById(targetTenantId);

    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      tenantId: targetTenantId,
      role: membership.role,
      permissions: membership.permissions || []
    };

    const token = generateToken(tokenPayload);
    setSessionCookie(res, token);

    res.json({
      token,
      activeTenant: tenant,
      role: membership.role
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
