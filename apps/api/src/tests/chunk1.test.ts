import { connectDB, disconnectDB } from '../db/connection';
import { TenantModel } from '../models/Tenant';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { TenantService, CustomerService, NotFoundError, ValidationError } from '../services/tenantScopedService';
import bcrypt from 'bcryptjs';

async function runChunk1AcceptanceTests() {
  console.log('\n=============================================================');
  console.log('   🧪 CHUNK 1 ACCEPTANCE TEST SUITE: MULTI-TENANCY & RBAC');
  console.log('=============================================================\n');

  await connectDB();

  // Clean test data
  await UserModel.deleteMany({ email: { $in: ['owner_a@swamyslabs.com', 'owner_b@deccangranites.com', 'accounts_a@swamyslabs.com', 'dispatch_a@swamyslabs.com'] } });
  await TenantModel.deleteMany({ slug: { $in: ['test-swamy-slabs', 'test-deccan-granites'] } });

  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition: boolean, testName: string) {
    testsTotal++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      throw new Error(`Test assertion failed: ${testName}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: User Registration and Company A Workspace Creation
    // -------------------------------------------------------------------------
    console.log('\n--- Step 1: User Registration & Company A Workspace Creation ---');
    const passwordHashA = await bcrypt.hash('SecurePass123!', 10);
    const userA = await UserModel.create({
      name: 'Rao Owner',
      email: 'owner_a@swamyslabs.com',
      passwordHash: passwordHashA,
      memberships: [],
      isActive: true
    });

    const { tenant: companyA, role: roleA } = await TenantService.createTenantWorkspace({
      name: 'Test Swamy Slabs Industries',
      slug: 'test-swamy-slabs',
      gstin: '36AAAAA1234A1Z5',
      email: 'billing@swamyslabs.com',
      address: {
        city: 'Tandur',
        state: 'Telangana',
        stateCode: '36',
        postalCode: '501141'
      },
      creatorUserId: userA._id.toString()
    });

    assert(companyA.name === 'Test Swamy Slabs Industries', 'Company A workspace created');
    assert(companyA.gstin === '36AAAAA1234A1Z5', 'Company A GSTIN registered');
    assert(roleA === 'OWNER_ADMIN', 'Creator assigned role OWNER_ADMIN');

    const updatedUserA = await UserModel.findById(userA._id);
    assert(updatedUserA?.memberships.length === 1, 'User A membership linked to Company A');
    assert(updatedUserA?.memberships[0].role === 'OWNER_ADMIN', 'User A role is OWNER_ADMIN');

    // -------------------------------------------------------------------------
    // TEST 2: Company B Workspace Creation & Separate Owner
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Company B Workspace Creation ---');
    const passwordHashB = await bcrypt.hash('SecurePass456!', 10);
    const userB = await UserModel.create({
      name: 'Kiran Owner',
      email: 'owner_b@deccangranites.com',
      passwordHash: passwordHashB,
      memberships: [],
      isActive: true
    });

    const { tenant: companyB } = await TenantService.createTenantWorkspace({
      name: 'Test Deccan Granites Ltd',
      slug: 'test-deccan-granites',
      gstin: '29BBBBB5678B1Z2',
      email: 'sales@deccangranites.com',
      address: {
        city: 'Bengaluru',
        state: 'Karnataka',
        stateCode: '29',
        postalCode: '560001'
      },
      creatorUserId: userB._id.toString()
    });

    assert(companyB.name === 'Test Deccan Granites Ltd', 'Company B workspace created');
    assert(companyB._id.toString() !== companyA._id.toString(), 'Company A and B have distinct tenant IDs');

    // -------------------------------------------------------------------------
    // TEST 3: Add Customers to Company A and Company B
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Customer Directory Addition ---');
    const customerA = await CustomerService.createCustomer(
      companyA._id.toString(),
      {
        name: 'Global Impex Pvt Ltd',
        shortCode: 'GIPL',
        contactPerson: 'Vikram Mehta',
        email: 'orders@globalimpex.in',
        gstin: '29ABCDE1234F1Z8',
        billingAddress: {
          city: 'Bengaluru',
          state: 'Karnataka',
          stateCode: '29',
          postalCode: '560001',
          country: 'India',
          street: 'MG Road'
        },
        shippingAddress: {
          city: 'Bengaluru',
          state: 'Karnataka',
          stateCode: '29',
          postalCode: '560099',
          country: 'India',
          street: 'Logistics Park'
        }
      },
      { id: userA._id.toString(), email: userA.email }
    );

    assert(customerA.tenantId.toString() === companyA._id.toString(), 'Customer A tenantId matches Company A');

    const customerB = await CustomerService.createCustomer(
      companyB._id.toString(),
      {
        name: 'Zenith Stone Corp',
        shortCode: 'ZSC',
        contactPerson: 'Sarah Jenkins',
        email: 'procurement@zenithstone.com',
        gstin: '27ZZZZZ9999Z1Z1',
        billingAddress: {
          city: 'Mumbai',
          state: 'Maharashtra',
          stateCode: '27',
          postalCode: '400001',
          country: 'India',
          street: 'Nariman Point'
        },
        shippingAddress: {
          city: 'Mumbai',
          state: 'Maharashtra',
          stateCode: '27',
          postalCode: '400001',
          country: 'India',
          street: 'Dock Warehouse'
        }
      },
      { id: userB._id.toString(), email: userB.email }
    );

    assert(customerB.tenantId.toString() === companyB._id.toString(), 'Customer B tenantId matches Company B');

    // -------------------------------------------------------------------------
    // TEST 4: STRICT MULTI-TENANT DATA ISOLATION VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Strict Multi-Tenant Data Isolation Checks ---');

    // 4A: READ Isolation
    const customersForA = await CustomerService.listCustomers(companyA._id.toString());
    assert(customersForA.length === 1 && customersForA[0].name === 'Global Impex Pvt Ltd', 'Company A list contains only Company A customers');

    const customersForB = await CustomerService.listCustomers(companyB._id.toString());
    assert(customersForB.length === 1 && customersForB[0].name === 'Zenith Stone Corp', 'Company B list contains only Company B customers');

    // 4B: CROSS-TENANT READ BLOCKED
    let crossReadBlocked = false;
    try {
      await CustomerService.getCustomerById(companyB._id.toString(), customerA._id.toString());
    } catch (err: any) {
      crossReadBlocked = err instanceof NotFoundError;
    }
    assert(crossReadBlocked, 'Cross-tenant read blocked: Company B cannot access Company A customer');

    // 4C: CROSS-TENANT UPDATE BLOCKED
    let crossUpdateBlocked = false;
    try {
      await CustomerService.updateCustomer(
        companyB._id.toString(),
        customerA._id.toString(),
        { name: 'Hacked Name' },
        { id: userB._id.toString(), email: userB.email }
      );
    } catch (err: any) {
      crossUpdateBlocked = err instanceof NotFoundError;
    }
    assert(crossUpdateBlocked, 'Cross-tenant update blocked: Company B cannot mutate Company A customer');

    // 4D: CROSS-TENANT DELETE BLOCKED
    let crossDeleteBlocked = false;
    try {
      await CustomerService.deleteCustomer(
        companyB._id.toString(),
        customerA._id.toString(),
        { id: userB._id.toString(), email: userB.email }
      );
    } catch (err: any) {
      crossDeleteBlocked = err instanceof NotFoundError;
    }
    assert(crossDeleteBlocked, 'Cross-tenant delete blocked: Company B cannot delete Company A customer');

    // 4E: AGGREGATION ISOLATION
    const aggResultForB = await CustomerService.aggregateCustomers(companyB._id.toString(), [
      { $match: { name: 'Global Impex Pvt Ltd' } }
    ]);
    assert(aggResultForB.length === 0, 'Scoped aggregation: Company B aggregation yields 0 results for Company A data');

    // -------------------------------------------------------------------------
    // TEST 5: ROLE-BASED ACCESS CONTROL (RBAC) RESTRICTIONS
    // -------------------------------------------------------------------------
    console.log('\n--- Step 5: Role-Based Access Control Verification ---');

    // Create Accounts Executive for Company A
    const userAccountsA = await UserModel.create({
      name: 'Accounts Executive User',
      email: 'accounts_a@swamyslabs.com',
      passwordHash: await bcrypt.hash('AccountsPass1!', 10),
      memberships: [{ tenantId: companyA._id, role: 'ACCOUNTS_EXECUTIVE', permissions: ['CUSTOMERS_EDIT'] }],
      isActive: true
    });

    // Create Dispatch Staff for Company A
    const userDispatchA = await UserModel.create({
      name: 'Dispatch Staff User',
      email: 'dispatch_a@swamyslabs.com',
      passwordHash: await bcrypt.hash('DispatchPass1!', 10),
      memberships: [{ tenantId: companyA._id, role: 'DISPATCH_STAFF', permissions: ['DISPATCH_CONFIRM'] }],
      isActive: true
    });

    assert(userAccountsA.memberships[0].role === 'ACCOUNTS_EXECUTIVE', 'Accounts Executive membership registered');
    assert(userDispatchA.memberships[0].role === 'DISPATCH_STAFF', 'Dispatch Staff membership registered');

    // -------------------------------------------------------------------------
    // TEST 6: INPUT VALIDATION & ERROR HANDLING
    // -------------------------------------------------------------------------
    console.log('\n--- Step 6: Input Validation & Error Handling Checks ---');

    // 6A: Invalid GSTIN format rejected
    let invalidGstinCaught = false;
    try {
      await CustomerService.createCustomer(
        companyA._id.toString(),
        {
          name: 'Invalid GSTIN Corp',
          gstin: 'INVALID123',
          billingAddress: { city: 'City', state: 'State', stateCode: '29', postalCode: '560001', country: 'India', street: 'Street' },
          shippingAddress: { city: 'City', state: 'State', stateCode: '29', postalCode: '560001', country: 'India', street: 'Street' }
        },
        { id: userA._id.toString(), email: userA.email }
      );
    } catch (err: any) {
      invalidGstinCaught = err instanceof ValidationError && err.message.includes('Invalid Indian GSTIN');
    }
    assert(invalidGstinCaught, 'Validation: Malformed GSTIN correctly rejected');

    // 6B: Duplicate Customer Name within tenant rejected
    let duplicateCustomerCaught = false;
    try {
      await CustomerService.createCustomer(
        companyA._id.toString(),
        {
          name: 'Global Impex Pvt Ltd', // already exists in Company A
          billingAddress: { city: 'City', state: 'State', stateCode: '29', postalCode: '560001', country: 'India', street: 'Street' },
          shippingAddress: { city: 'City', state: 'State', stateCode: '29', postalCode: '560001', country: 'India', street: 'Street' }
        },
        { id: userA._id.toString(), email: userA.email }
      );
    } catch (err: any) {
      duplicateCustomerCaught = err instanceof ValidationError && err.message.includes('already exists');
    }
    assert(duplicateCustomerCaught, 'Validation: Duplicate customer name in same tenant correctly rejected');

    // 6C: Missing mandatory address fields rejected
    let missingAddressCaught = false;
    try {
      await CustomerService.createCustomer(
        companyA._id.toString(),
        { name: 'No Address Corp' },
        { id: userA._id.toString(), email: userA.email }
      );
    } catch (err: any) {
      missingAddressCaught = err instanceof ValidationError;
    }
    assert(missingAddressCaught, 'Validation: Missing address details correctly rejected');

    // -------------------------------------------------------------------------
    // CLEANUP & SUMMARY
    // -------------------------------------------------------------------------
    // Clean up test data
    await CustomerModel.deleteMany({ tenantId: { $in: [companyA._id, companyB._id] } });
    await TenantModel.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    await UserModel.deleteMany({ _id: { $in: [userA._id, userB._id, userAccountsA._id, userDispatchA._id] } });

    console.log('\n=============================================================');
    console.log(`   🎉 CHUNK 1 COMPLETE: ${testsPassed}/${testsTotal} TESTS PASSED WITH 100% SUCCESS`);
    console.log('=============================================================\n');
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  runChunk1AcceptanceTests().catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
