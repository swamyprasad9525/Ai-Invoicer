import bcrypt from 'bcryptjs';
import { TenantModel } from '../models/Tenant';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { DescriptionRuleModel } from '../models/DescriptionRule';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { connectDB, disconnectDB } from '../db/connection';

export async function seedPilotData(): Promise<void> {
  const existingTenant = await TenantModel.findOne({ slug: 'swamy-slabs' });
  if (existingTenant) {
    console.log('[SEED] Swamy Slabs pilot tenant already exists. Skipping seed.');
    return;
  }

  console.log('[SEED] Initializing Swamy Slabs Industries pilot tenant & test cases...');

  // 1. Create Swamy Slabs Industries Tenant
  const tenant = await TenantModel.create({
    name: 'Swamy Slabs Industries',
    slug: 'swamy-slabs',
    gstin: '36AAAAA1234A1Z5', // Telangana state code 36
    phone: '+91 98765 43210',
    email: 'billing@swamyslabs.com',
    address: {
      street: 'Plot 42, Stone Industrial Park, Tandur Road',
      city: 'Tandur',
      state: 'Telangana',
      stateCode: '36',
      postalCode: '501141',
      country: 'India'
    },
    bankDetails: {
      bankName: 'State Bank of India',
      accountNumber: '98765432100',
      ifscCode: 'SBIN0001234',
      branch: 'Tandur Main Branch'
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

  // 2. Create Users: Admin & Accounts Executive
  const passwordHash = await bcrypt.hash('admin123', 10);
  const adminUser = await UserModel.create({
    name: 'Swamy Admin',
    email: 'admin@swamyslabs.com',
    passwordHash,
    memberships: [
      {
        tenantId: tenant._id,
        role: 'OWNER_ADMIN',
        permissions: ['*']
      }
    ],
    isActive: true
  });

  const accountsUser = await UserModel.create({
    name: 'Ramesh Accounts',
    email: 'accounts@swamyslabs.com',
    passwordHash,
    memberships: [
      {
        tenantId: tenant._id,
        role: 'ACCOUNTS_EXECUTIVE',
        permissions: ['DRAFTS', 'UPLOAD']
      }
    ],
    isActive: true
  });

  // 3. Create Pilot Customer: Global Impex Private Limited
  const customer = await CustomerModel.create({
    tenantId: tenant._id,
    name: 'Global Impex Private Limited',
    shortCode: 'GIPL',
    contactPerson: 'Vikram Mehta',
    email: 'orders@globalimpex.in',
    phone: '+91 91234 56789',
    gstin: '29ABCDE1234F1Z8', // Karnataka state code 29 -> Interstate IGST
    billingAddress: {
      street: '12th Floor, Trade Tower, MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: '29',
      postalCode: '560001',
      country: 'India'
    },
    shippingAddress: {
      street: 'Yard 4B, Bengaluru Logistics Park',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: '29',
      postalCode: '560099',
      country: 'India'
    },
    defaultCurrency: 'INR',
    paymentTermsDays: 30
  });

  // 4. Create Swamy Slabs Description Rule
  await DescriptionRuleModel.create({
    tenantId: tenant._id,
    companyName: 'Swamy Slabs Industries',
    ruleVersion: 1,
    fieldOrder: [
      'stone',
      'pattern',
      'size',
      'thickness',
      'topFinish',
      'edgeFinish',
      'finalFinish',
      'crateCount'
    ],
    aliases: {
      'Tandur Yellow Limestone': 'T.YELLOW',
      'T. Yellow': 'T.YELLOW',
      'Half Honed': 'H/H',
      'Tumbled': 'T/B',
      'Handcut': 'H/C',
      'Straight Handcut': 'H/C',
      'Brushed': 'BRUSHED',
      'Natural': 'NATURAL',
      'Palisade': 'PALISADE',
      'Tiles': 'TILES',
      'French Opus': 'FRENCH OPUS'
    },
    categoryPolicies: [
      {
        category: 'French Opus',
        includePatternBreakdown: true
      }
    ],
    crateSuffix: 'CRT',
    unknownTermPolicy: 'review_required',
    isApproved: true,
    approvedBy: adminUser.email
  });

  // 5. Pre-seed Benchmark Purchase Order POM14356A (Blueprint Page 6)
  await PurchaseOrderModel.create({
    tenantId: tenant._id,
    customerId: customer._id,
    sourceFileId: 'sample_POM14356A.pdf',
    fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    originalFileName: 'PO_POM14356A_SwamySlabs.pdf',
    poNumber: 'POM14356A',
    poDate: '2026-09-09',
    currency: 'INR',
    buyerName: 'Global Impex Private Limited',
    poGoodsTotal: '197880.00',
    status: 'EXTRACTED',
    items: [
      {
        line: 1,
        material: 'Tandur Yellow Limestone',
        category: 'Palisade',
        size: '100x50 CM',
        thickness: '3-5 CM',
        topFinish: ['Natural'],
        bottomFinish: ['Natural'],
        edgeFinish: ['Straight Handcut'],
        finalFinish: [],
        patternBreakdown: '',
        crateCount: 3,
        orderedQuantity: '33.00',
        unit: 'SQM',
        rate: '1150.00',
        poLineTotal: '37950.00',
        sourcePage: 1,
        confidence: 0.99,
        reviewFlags: []
      },
      {
        line: 2,
        material: 'Tandur Yellow Limestone',
        category: 'Palisade',
        size: '150x50 CM',
        thickness: '3-5 CM',
        topFinish: ['Natural'],
        bottomFinish: ['Natural'],
        edgeFinish: ['Straight Handcut'],
        finalFinish: [],
        patternBreakdown: '',
        crateCount: 3,
        orderedQuantity: '40.50',
        unit: 'SQM',
        rate: '1300.00',
        poLineTotal: '52650.00',
        sourcePage: 1,
        confidence: 0.99,
        reviewFlags: []
      },
      {
        line: 3,
        material: 'Tandur Yellow Limestone',
        category: 'Tiles',
        size: '100x50 CM',
        thickness: '3 CM',
        topFinish: ['Natural'],
        bottomFinish: ['Natural'],
        edgeFinish: ['Sawn'],
        finalFinish: [],
        patternBreakdown: '',
        crateCount: 2,
        orderedQuantity: '22.00',
        unit: 'SQM',
        rate: '1080.00',
        poLineTotal: '23760.00',
        sourcePage: 1,
        confidence: 0.98,
        reviewFlags: []
      },
      {
        line: 4,
        material: 'Tandur Yellow Limestone',
        category: 'Tiles',
        size: '60x40 CM',
        thickness: '2 CM',
        topFinish: ['Half Honed'],
        bottomFinish: ['Calibrated'],
        edgeFinish: ['Handcut'],
        finalFinish: ['Tumbled', 'Brushed'],
        patternBreakdown: '',
        crateCount: 5,
        orderedQuantity: '100.80',
        unit: 'SQM',
        rate: '550.00',
        poLineTotal: '55440.00',
        sourcePage: 1,
        confidence: 0.99,
        reviewFlags: []
      },
      {
        line: 5,
        material: 'Tandur Yellow Limestone',
        category: 'French Opus',
        size: 'Modular Set',
        thickness: '3 CM',
        topFinish: ['Half Honed'],
        bottomFinish: ['Calibrated'],
        edgeFinish: ['Handcut'],
        finalFinish: ['Tumbled', 'Brushed'],
        patternBreakdown: '20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC',
        crateCount: 3,
        orderedQuantity: '43.20',
        unit: 'SQM',
        rate: '650.00',
        poLineTotal: '28080.00',
        sourcePage: 1,
        confidence: 0.97,
        reviewFlags: []
      }
    ],
    warnings: [],
    version: 1
  });

  console.log('[SEED] Successfully seeded Swamy Slabs Industries pilot environment!');
}

// Direct CLI invocation
if (require.main === module) {
  (async () => {
    await connectDB();
    await seedPilotData();
    await disconnectDB();
    process.exit(0);
  })();
}
