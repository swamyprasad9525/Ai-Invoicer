import mongoose, { Types } from 'mongoose';
import { CustomerModel, CustomerDocument } from '../models/Customer';
import { TenantModel, TenantDocument } from '../models/Tenant';
import { UserModel } from '../models/User';
import { Customer, Tenant, UserRole } from '@invoiceai/shared';
import { recordAudit } from './auditService';

export class TenantIsolationError extends Error {
  constructor(message: string = 'Tenant boundary violation: Access to entity denied.') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * TenantService encapsulates workspace creation, profile management, and multi-tenant membership operations.
 */
export class TenantService {
  public static async createTenantWorkspace(params: {
    name: string;
    slug?: string;
    gstin: string;
    phone?: string;
    email: string;
    address: {
      street?: string;
      city: string;
      state: string;
      stateCode: string;
      postalCode: string;
      country?: string;
    };
    bankDetails?: {
      bankName: string;
      accountNumber: string;
      ifscCode: string;
      branch?: string;
    };
    creatorUserId: string;
  }): Promise<{ tenant: TenantDocument; role: UserRole }> {
    const slug = (params.slug || params.name.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Check slug uniqueness
    const existing = await TenantModel.findOne({ slug });
    if (existing) {
      throw new ValidationError(`A company with the identifier "${slug}" already exists. Please choose a different name or slug.`);
    }

    // Validate GSTIN format
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(params.gstin.toUpperCase())) {
      throw new ValidationError(`Invalid Indian GSTIN: "${params.gstin}". Format must match standard 15-character GST format.`);
    }

    const tenant = await TenantModel.create({
      name: params.name,
      slug,
      gstin: params.gstin.toUpperCase(),
      phone: params.phone || '',
      email: params.email.toLowerCase(),
      address: {
        street: params.address.street || '',
        city: params.address.city,
        state: params.address.state,
        stateCode: params.address.stateCode,
        postalCode: params.address.postalCode,
        country: params.address.country || 'India'
      },
      bankDetails: params.bankDetails || {
        bankName: 'Default Business Bank',
        accountNumber: '0000000000',
        ifscCode: 'BANK0000001',
        branch: 'Main'
      },
      invoiceSettings: {
        invoicePrefix: 'INV',
        financialYear: '2026-27',
        nextSequenceNumber: 1,
        defaultHsnCode: '6802',
        defaultTaxRatePercent: 18,
        paymentTermsDays: 30
      },
      status: 'ACTIVE'
    });

    // Add membership to creator as OWNER_ADMIN
    await UserModel.findByIdAndUpdate(params.creatorUserId, {
      $push: {
        memberships: {
          tenantId: tenant._id,
          role: 'OWNER_ADMIN',
          permissions: ['*']
        }
      }
    });

    return { tenant, role: 'OWNER_ADMIN' };
  }

  public static async getTenantById(tenantId: string): Promise<TenantDocument> {
    const tenant = await TenantModel.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Company workspace not found.');
    }
    return tenant;
  }

  public static async updateTenantProfile(
    tenantId: string,
    updates: Partial<Tenant>,
    actor: { id: string; email: string }
  ): Promise<TenantDocument> {
    const tenant = await TenantModel.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Company workspace not found.');
    }

    const before = tenant.toObject();
    const allowed = ['name', 'phone', 'email', 'address', 'bankDetails', 'invoiceSettings'];
    for (const key of allowed) {
      if ((updates as any)[key] !== undefined) {
        (tenant as any)[key] = (updates as any)[key];
      }
    }

    await tenant.save();

    await recordAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'TENANT_UPDATED',
      entityType: 'TENANT',
      entityId: tenant._id.toString(),
      description: `Updated profile for company ${tenant.name}`,
      beforeSnapshot: before,
      afterSnapshot: tenant.toObject()
    });

    return tenant;
  }

  public static async getUserMemberships(userId: string): Promise<any[]> {
    const user = await UserModel.findById(userId).populate('memberships.tenantId', 'name slug gstin status');
    if (!user) {
      throw new NotFoundError('User not found.');
    }
    return user.memberships;
  }
}

/**
 * CustomerService strictly isolates all customer CRUD and aggregation operations to the active tenant.
 */
export class CustomerService {
  /**
   * Creates a customer record strictly scoped to tenantId with uniqueness checks.
   */
  public static async createCustomer(
    tenantId: string,
    data: Partial<Customer>,
    actor: { id: string; email: string }
  ): Promise<CustomerDocument> {
    if (!data.name || !data.name.trim()) {
      throw new ValidationError('Customer name is required.');
    }

    if (!data.billingAddress || !data.billingAddress.city || !data.billingAddress.state || !data.billingAddress.stateCode) {
      throw new ValidationError('Customer billing address with city, state, and 2-digit state code is required.');
    }

    if (!data.shippingAddress || !data.shippingAddress.city || !data.shippingAddress.state || !data.shippingAddress.stateCode) {
      throw new ValidationError('Customer shipping address with city, state, and 2-digit state code is required.');
    }

    if (data.gstin && data.gstin.trim()) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(data.gstin.trim().toUpperCase())) {
        throw new ValidationError(`Invalid Indian GSTIN: "${data.gstin}". Format must match standard 15-character GST format.`);
      }
    }

    // Check duplicate customer name within this specific tenant
    const existing = await CustomerModel.findOne({
      tenantId: new Types.ObjectId(tenantId),
      name: new RegExp(`^${data.name.trim()}$`, 'i'),
      isActive: true
    });

    if (existing) {
      throw new ValidationError(`A customer named "${data.name}" already exists in your company directory.`);
    }

    const customer = await CustomerModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: data.name.trim(),
      shortCode: data.shortCode?.trim() || '',
      contactPerson: data.contactPerson?.trim() || '',
      email: data.email?.toLowerCase().trim() || '',
      phone: data.phone?.trim() || '',
      gstin: data.gstin?.trim().toUpperCase() || '',
      billingAddress: data.billingAddress,
      shippingAddress: data.shippingAddress,
      defaultCurrency: data.defaultCurrency || 'INR',
      paymentTermsDays: data.paymentTermsDays || 30,
      notes: data.notes || '',
      isActive: true
    });

    await recordAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer._id.toString(),
      description: `Created customer "${customer.name}" in customer directory`,
      afterSnapshot: customer.toObject()
    });

    return customer;
  }

  /**
   * Retrieves a single customer record, strictly verifying tenant ownership.
   */
  public static async getCustomerById(tenantId: string, customerId: string): Promise<CustomerDocument> {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new ValidationError('Invalid customer ID format.');
    }

    const customer = await CustomerModel.findOne({
      _id: new Types.ObjectId(customerId),
      tenantId: new Types.ObjectId(tenantId),
      isActive: true
    });

    if (!customer) {
      throw new NotFoundError('Customer not found in this company directory.');
    }

    return customer;
  }

  /**
   * Lists customers for the tenant.
   */
  public static async listCustomers(tenantId: string): Promise<CustomerDocument[]> {
    return CustomerModel.find({
      tenantId: new Types.ObjectId(tenantId),
      isActive: true
    }).sort({ name: 1 });
  }

  /**
   * Updates customer details, strictly enforcing tenant boundaries.
   */
  public static async updateCustomer(
    tenantId: string,
    customerId: string,
    updates: Partial<Customer>,
    actor: { id: string; email: string }
  ): Promise<CustomerDocument> {
    const customer = await this.getCustomerById(tenantId, customerId);

    const before = customer.toObject();

    if (updates.name && updates.name.trim()) customer.name = updates.name.trim();
    if (updates.shortCode !== undefined) customer.shortCode = updates.shortCode.trim();
    if (updates.contactPerson !== undefined) customer.contactPerson = updates.contactPerson.trim();
    if (updates.email !== undefined) customer.email = updates.email.toLowerCase().trim();
    if (updates.phone !== undefined) customer.phone = updates.phone.trim();
    if (updates.gstin !== undefined) {
      if (updates.gstin.trim()) {
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!gstinRegex.test(updates.gstin.trim().toUpperCase())) {
          throw new ValidationError(`Invalid Indian GSTIN: "${updates.gstin}". Format must match standard 15-character GST format.`);
        }
      }
      customer.gstin = updates.gstin.trim().toUpperCase();
    }
    if (updates.billingAddress) customer.billingAddress = updates.billingAddress as any;
    if (updates.shippingAddress) customer.shippingAddress = updates.shippingAddress as any;
    if (updates.defaultCurrency) customer.defaultCurrency = updates.defaultCurrency;
    if (updates.paymentTermsDays !== undefined) customer.paymentTermsDays = updates.paymentTermsDays;
    if (updates.notes !== undefined) customer.notes = updates.notes;

    await customer.save();

    await recordAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: customer._id.toString(),
      description: `Updated customer "${customer.name}"`,
      beforeSnapshot: before,
      afterSnapshot: customer.toObject()
    });

    return customer;
  }

  /**
   * Deletes a customer record (soft-delete), strictly enforcing tenant boundaries.
   */
  public static async deleteCustomer(
    tenantId: string,
    customerId: string,
    actor: { id: string; email: string }
  ): Promise<void> {
    const customer = await this.getCustomerById(tenantId, customerId);
    customer.isActive = false;
    await customer.save();

    await recordAudit({
      tenantId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: customer._id.toString(),
      description: `Deactivated customer "${customer.name}"`
    });
  }

  /**
   * Executes an aggregation query strictly prepending a tenant filter stage.
   */
  public static async aggregateCustomers(tenantId: string, pipeline: any[]): Promise<any[]> {
    const scopedPipeline = [
      { $match: { tenantId: new Types.ObjectId(tenantId), isActive: true } },
      ...pipeline
    ];
    return CustomerModel.aggregate(scopedPipeline);
  }
}
