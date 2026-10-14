import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/User';
import { TenantModel } from '../models/Tenant';
import { TenantService } from '../services/tenantScopedService';
import { generateToken, requireAuth, setSessionCookie, clearSessionCookie } from '../middleware/auth';
import { recordAudit } from '../services/auditService';

export const authRouter = Router();

// Register new user and optionally create an initial company workspace
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, companyName, companySlug, gstin, city, state, stateCode, postalCode } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      memberships: [],
      isActive: true
    });

    let activeTenant: any = null;
    let userRole = 'OWNER_ADMIN';

    // If company details provided, create company workspace
    if (companyName && gstin && city && state && stateCode && postalCode) {
      const { tenant, role } = await TenantService.createTenantWorkspace({
        name: companyName,
        slug: companySlug,
        gstin,
        email: normalizedEmail,
        address: {
          city,
          state,
          stateCode,
          postalCode
        },
        creatorUserId: user._id.toString()
      });
      activeTenant = tenant;
      userRole = role;
    } else {
      // Check if Swamy Slabs exists and can be assigned as default pilot, or require company setup
      const defaultTenant = await TenantModel.findOne({ slug: 'swamy-slabs' });
      if (defaultTenant) {
        user.memberships.push({
          tenantId: defaultTenant._id,
          role: 'OWNER_ADMIN',
          permissions: ['*']
        });
        await user.save();
        activeTenant = defaultTenant;
      }
    }

    if (!activeTenant) {
      res.status(400).json({ error: 'Company details (companyName, gstin, city, state, stateCode, postalCode) are required to create a business workspace.' });
      return;
    }

    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      tenantId: activeTenant._id.toString(),
      role: userRole as any,
      permissions: ['*']
    };

    const token = generateToken(tokenPayload);
    setSessionCookie(res, token);

    await recordAudit({
      tenantId: activeTenant._id.toString(),
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user._id.toString(),
      description: `User ${user.email} registered and created company workspace ${activeTenant.name}`
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: userRole,
        tenant: {
          id: activeTenant._id,
          name: activeTenant.name,
          slug: activeTenant.slug,
          gstin: activeTenant.gstin
        }
      }
    });
  } catch (err: any) {
    console.error('[AUTH_REGISTER_ERROR]', err);
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// Login
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const defaultMembership = user.memberships[0];
    if (!defaultMembership) {
      res.status(403).json({ error: 'User does not belong to any company workspace.' });
      return;
    }

    const tenant = await TenantModel.findById(defaultMembership.tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Company workspace record not found.' });
      return;
    }

    const tokenPayload = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      tenantId: defaultMembership.tenantId.toString(),
      role: defaultMembership.role,
      permissions: defaultMembership.permissions || []
    };

    const token = generateToken(tokenPayload);
    setSessionCookie(res, token);

    user.lastLoginAt = new Date();
    await user.save();

    await recordAudit({
      tenantId: defaultMembership.tenantId.toString(),
      actorId: user._id.toString(),
      actorEmail: user.email,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user._id.toString(),
      description: `User ${user.email} logged in with role ${defaultMembership.role}.`
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: defaultMembership.role,
        tenant: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          gstin: tenant.gstin
        }
      }
    });
  } catch (err: any) {
    console.error('[AUTH_LOGIN_ERROR]', err);
    res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

// Logout (Clears HTTP-only session cookie)
authRouter.post('/logout', (req: Request, res: Response): void => {
  clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Get current session details
authRouter.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findById(req.user!.id).select('-passwordHash');
    const tenant = await TenantModel.findById(req.user!.tenantId);

    if (!user || !tenant) {
      res.status(404).json({ error: 'User or company profile not found.' });
      return;
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: req.user!.role,
        tenant: {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug,
          gstin: tenant.gstin
        }
      },
      activeTenant: tenant,
      memberships: user.memberships
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
