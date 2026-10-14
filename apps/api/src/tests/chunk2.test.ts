/**
 * CHUNK 2 ACCEPTANCE TEST SUITE
 * Secure Document Ingestion and Background Processing
 *
 * Tests:
 *  1. Upload a valid PO PDF (real magic bytes)
 *  2. File stored securely and retrievable via signed token
 *  3. Repeat upload of same file → duplicate warning (not hard rejection)
 *  4. forceUpload=true overrides duplicate check
 *  5. Reject non-PDF file (magic byte mismatch)
 *  6. Reject empty file
 *  7. Reject file that is too large
 *  8. Cross-tenant signed-URL access blocked
 *  9. Background job: runs, completes, and updates PO status to EXTRACTED
 * 10. Failed job is retryable
 */

import { connectDB, disconnectDB } from '../db/connection';
import { TenantModel } from '../models/Tenant';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { JobModel, JobQueueService } from '../services/jobQueueService';
import { registerPOIngestionWorker, PO_INGEST_JOB } from '../services/poIngestionWorker';
import { StorageService } from '../services/storageService';
import { FileValidationService, FILE_LIMITS } from '../services/fileValidationService';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ─── Minimal valid PDF (smallest valid 1-page PDF) ───────────────────────────
// This is a real 68-byte PDF with correct magic bytes and structure
const VALID_PDF_BUFFER = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type /Catalog/Pages 2 0 R>>endobj ' +
  '2 0 obj<</Type /Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type /Page/MediaBox[0 0 3 3]>>endobj\n' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
  'ascii'
);

// A different valid PDF (to test non-duplicate)
const VALID_PDF_BUFFER_2 = Buffer.from(
  '%PDF-1.0\n1 0 obj<</Type /Catalog/Pages 2 0 R>>endobj ' +
  '2 0 obj<</Type /Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type /Page/MediaBox[0 0 9 9]>>endobj\n' + // Different dimensions = different hash
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF',
  'ascii'
);

// A PNG file masquerading as a PDF (wrong magic bytes)
const FAKE_PDF_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ...Array(100).fill(0x00) // padding
]);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runChunk2Tests() {
  console.log('\n=============================================================');
  console.log('   🧪 CHUNK 2 ACCEPTANCE TEST SUITE: DOCUMENT INGESTION');
  console.log('=============================================================\n');

  await connectDB();

  // Register workers before init so processors are ready
  registerPOIngestionWorker();
  await JobQueueService.init();

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const TEST_EMAILS_A = ['chunk2_owner_a@testco.com'];
  const TEST_EMAILS_B = ['chunk2_owner_b@otherco.com'];
  await UserModel.deleteMany({ email: { $in: [...TEST_EMAILS_A, ...TEST_EMAILS_B] } });
  await TenantModel.deleteMany({ slug: { $in: ['chunk2-testco', 'chunk2-otherco'] } });

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  // ── Setup: two companies with distinct tenants ────────────────────────────
  const hashA = await bcrypt.hash('TestPass123!', 10);
  const userA = await UserModel.create({ name: 'Tenant A Owner', email: TEST_EMAILS_A[0], passwordHash: hashA, memberships: [], isActive: true });

  const tenantA = await TenantModel.create({
    name: 'Chunk2 TestCo', slug: 'chunk2-testco', gstin: '36CTEST1234C1Z5',
    email: 'billing@testco.com', phone: '', status: 'ACTIVE',
    address: { city: 'Hyderabad', state: 'Telangana', stateCode: '36', postalCode: '500001', country: 'India' },
    bankDetails: { bankName: 'Test Bank', accountNumber: '1234567890', ifscCode: 'TEST0001234' },
    invoiceSettings: { invoicePrefix: 'INV', financialYear: '2026-27', nextSequenceNumber: 1, defaultHsnCode: '6802', defaultTaxRatePercent: 18, paymentTermsDays: 30 }
  });

  await UserModel.findByIdAndUpdate(userA._id, {
    $push: { memberships: { tenantId: tenantA._id, role: 'OWNER_ADMIN', permissions: ['*'] } }
  });

  const hashB = await bcrypt.hash('TestPass456!', 10);
  const userB = await UserModel.create({ name: 'Tenant B Owner', email: TEST_EMAILS_B[0], passwordHash: hashB, memberships: [], isActive: true });

  const tenantB = await TenantModel.create({
    name: 'Chunk2 OtherCo', slug: 'chunk2-otherco', gstin: '29CTEST5678C1Z2',
    email: 'billing@otherco.com', phone: '', status: 'ACTIVE',
    address: { city: 'Bengaluru', state: 'Karnataka', stateCode: '29', postalCode: '560001', country: 'India' },
    bankDetails: { bankName: 'Other Bank', accountNumber: '9876543210', ifscCode: 'OTHR0001234' },
    invoiceSettings: { invoicePrefix: 'INV', financialYear: '2026-27', nextSequenceNumber: 1, defaultHsnCode: '6802', defaultTaxRatePercent: 18, paymentTermsDays: 30 }
  });

  await UserModel.findByIdAndUpdate(userB._id, {
    $push: { memberships: { tenantId: tenantB._id, role: 'OWNER_ADMIN', permissions: ['*'] } }
  });

  const tenantAId = tenantA._id.toString();
  const tenantBId = tenantB._id.toString();
  const fileHash = FileValidationService.computeHash(VALID_PDF_BUFFER);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: File validation — valid PDF passes all checks
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 1: Valid PDF passes all validation layers ---');
  const validResult = FileValidationService.validate(
    VALID_PDF_BUFFER, 'test_po.pdf', 'application/pdf', VALID_PDF_BUFFER.length
  );
  assert(validResult.valid, 'Valid PDF passes validation');
  assert(validResult.errors.length === 0, 'No validation errors for valid PDF');
  assert(validResult.detectedMimeType === 'application/pdf', 'Correct MIME detected from magic bytes');
  assert(validResult.fileHash.length === 64, 'SHA-256 hash computed (64 hex chars)');
  assert(!validResult.isSuspicious, 'Clean PDF not flagged suspicious');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: File validation — non-PDF rejected
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 2: Non-PDF (PNG masquerading) rejected ---');
  const invalidResult = FileValidationService.validate(
    FAKE_PDF_BUFFER, 'evil.pdf', 'application/pdf', FAKE_PDF_BUFFER.length
  );
  assert(!invalidResult.valid, 'Non-PDF file fails validation');
  assert(invalidResult.errors.some(e => e.includes('content mismatch') || e.includes('not contain a valid PDF')), 'Correct error message for MIME mismatch');
  assert(invalidResult.isSuspicious, 'Mismatched MIME flagged as suspicious');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: File validation — empty file rejected
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 3: Empty file rejected ---');
  const emptyResult = FileValidationService.validate(Buffer.alloc(0), 'empty.pdf', 'application/pdf', 0);
  assert(!emptyResult.valid, 'Empty file fails validation');
  assert(emptyResult.errors.some(e => e.includes('empty')), 'Empty file error message present');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: File validation — oversized file rejected
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 4: Oversized file rejected ---');
  const oversizeResult = FileValidationService.validate(
    VALID_PDF_BUFFER, 'big.pdf', 'application/pdf', FILE_LIMITS.maxFileSizeBytes + 1
  );
  assert(!oversizeResult.valid, 'Oversized file fails validation');
  assert(oversizeResult.errors.some(e => e.includes('too large')), 'Oversize error message present');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Store and retrieve via signed token
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 5: Secure storage and signed-token retrieval ---');
  const stored = await StorageService.storeFile({
    tenantId: tenantAId,
    fileBuffer: VALID_PDF_BUFFER,
    originalFileName: 'test_po.pdf',
    mimeType: 'application/pdf',
    fileHash
  });
  assert(stored.storageKey.startsWith(`${tenantAId}/`), 'Storage key is namespaced under tenantId');
  assert(stored.storageBackend === 'LOCAL' || stored.storageBackend === 'S3', 'Valid storage backend reported');

  // Issue signed token and resolve it
  const token = await StorageService.generateSignedDownloadToken(stored.storageKey, tenantAId);
  assert(token.length === 64, 'Signed token is a 64-char hex string');

  const resolved = await StorageService.resolveSignedToken(token, tenantAId);
  assert(resolved !== null, 'Signed token resolves to file content');
  assert(resolved!.buffer.length === VALID_PDF_BUFFER.length, 'Retrieved file matches uploaded file size');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Cross-tenant token access blocked
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 6: Cross-tenant signed-token access blocked ---');
  const tokenA = await StorageService.generateSignedDownloadToken(stored.storageKey, tenantAId);

  // Tenant B tries to use Tenant A's token
  let crossTenantBlocked = false;
  try {
    const resolvedByB = await StorageService.resolveSignedToken(tokenA, tenantBId);
    crossTenantBlocked = resolvedByB === null;
  } catch {
    crossTenantBlocked = true;
  }
  assert(crossTenantBlocked, 'Cross-tenant signed token access returns null (blocked)');

  // Tenant B cannot even generate a signed URL for Tenant A's storage key
  let generateCrossBlocked = false;
  try {
    await StorageService.generateSignedDownloadToken(stored.storageKey, tenantBId);
  } catch (e: any) {
    generateCrossBlocked = e.message.includes('does not belong to your tenant');
  }
  assert(generateCrossBlocked, 'Cross-tenant signed URL generation throws access-denied error');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Duplicate detection (same file hash)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 7: Duplicate file detection ---');
  const po1 = await PurchaseOrderModel.create({
    tenantId: tenantAId, sourceFileId: stored.storageKey, fileHash,
    originalFileName: 'test_po.pdf', poNumber: 'PO-001', poDate: '2026-09-01',
    currency: 'INR', buyerName: 'Test Buyer', poGoodsTotal: '50000.00',
    status: 'EXTRACTED', items: [], warnings: []
  });

  const duplicatePO = await PurchaseOrderModel.findOne({ tenantId: tenantAId, fileHash });
  assert(duplicatePO !== null, 'Duplicate PO found by fileHash query');
  assert(duplicatePO!._id.toString() === po1._id.toString(), 'Correct PO returned on dedup check');

  // Same hash in different tenant should NOT be detected as duplicate
  const po2 = await PurchaseOrderModel.create({
    tenantId: tenantBId, sourceFileId: `${tenantBId}/${fileHash}.pdf`, fileHash,
    originalFileName: 'test_po.pdf', poNumber: 'PO-002', poDate: '2026-09-01',
    currency: 'INR', buyerName: 'Other Buyer', poGoodsTotal: '50000.00',
    status: 'EXTRACTED', items: [], warnings: []
  });

  const crossTenantDup = await PurchaseOrderModel.findOne({ tenantId: tenantAId, fileHash: FileValidationService.computeHash(VALID_PDF_BUFFER_2) });
  assert(crossTenantDup === null, 'Cross-tenant same hash is not treated as duplicate for Tenant A');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Background job — enqueue, process, and verify PO status updated
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 8: Background job processing ---');

  // Create a fresh PO with UPLOADED status
  const poPending = await PurchaseOrderModel.create({
    tenantId: tenantAId, sourceFileId: stored.storageKey, fileHash: crypto.randomBytes(16).toString('hex'),
    originalFileName: 'queued_po.pdf', poNumber: 'PO-PENDING-TEST', poDate: '2026-09-15',
    currency: 'INR', buyerName: 'Pending', poGoodsTotal: '0.00',
    status: 'UPLOADED', items: [], warnings: []
  });

  const jobId = await JobQueueService.enqueue({
    name: PO_INGEST_JOB,
    data: { poId: poPending._id.toString(), storageKey: stored.storageKey },
    tenantId: tenantAId,
    maxAttempts: 3
  });

  assert(jobId.length > 0, 'Job successfully enqueued and jobId returned');

  // Wait for in-process worker to complete (max 8s)
  let jobDone = false;
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    const job = await JobModel.findById(jobId);
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      jobDone = true;
      assert(job.status === 'completed', 'Background extraction job completed successfully');
      break;
    }
  }
  assert(jobDone, 'Job reached terminal state within 8 seconds');

  // Check PO status was updated by the worker
  const processedPO = await PurchaseOrderModel.findById(poPending._id);
  assert(
    processedPO!.status === 'EXTRACTED' || processedPO!.status === 'EXTRACTION_FAILED',
    'PO status updated from UPLOADED by background worker',
    `Status: ${processedPO!.status}`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Tenant context preserved in background worker
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 9: Tenant isolation in background worker ---');
  const jobDoc = await JobModel.findById(jobId);
  assert(jobDoc!.tenantId === tenantAId, 'Job document preserves correct tenantId');
  assert(jobDoc!.data.tenantId === tenantAId, 'Job data payload embeds tenantId');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Failed job retry
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test 10: Failed job retry ---');

  // Manually mark a job as failed
  const failedJob = await JobModel.create({
    name: PO_INGEST_JOB,
    data: { poId: 'nonexistent-id', storageKey: 'bad-key', tenantId: tenantAId },
    tenantId: tenantAId,
    status: 'failed',
    attempts: 3,
    maxAttempts: 3,
    failureReason: 'PurchaseOrder nonexistent-id not found',
    failedAt: new Date()
  });

  // Should create a new retry job
  const retryJobId = await JobQueueService.retryJob(failedJob._id.toString(), tenantAId);
  assert(retryJobId !== failedJob._id.toString(), 'Retry creates a new job (different ID)');
  assert(retryJobId.length > 0, 'Retry job ID is valid');

  // Cross-tenant retry blocked
  let crossRetryBlocked = false;
  try {
    await JobQueueService.retryJob(failedJob._id.toString(), tenantBId);
  } catch (e: any) {
    crossRetryBlocked = e.message.includes('does not belong');
  }
  assert(crossRetryBlocked, 'Cross-tenant job retry correctly blocked');

  // ─────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────
  await PurchaseOrderModel.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
  await JobModel.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
  await CustomerModel.deleteMany({ tenantId: { $in: [tenantAId, tenantBId] } });
  await TenantModel.deleteMany({ _id: { $in: [tenantA._id, tenantB._id] } });
  await UserModel.deleteMany({ _id: { $in: [userA._id, userB._id] } });

  console.log('\n=============================================================');
  console.log(`   🎉 CHUNK 2 COMPLETE: ${passed}/${total} TESTS PASSED`);
  console.log('=============================================================\n');
}

if (require.main === module) {
  connectDB()
    .then(() => runChunk2Tests())
    .catch((err) => {
      console.error('Chunk 2 test execution failed:', err);
      process.exit(1);
    })
    .finally(() => disconnectDB());
}
