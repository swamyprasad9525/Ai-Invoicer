/**
 * POIngestionWorker — Background processor for Purchase Order document ingestion.
 *
 * Job name: "po:ingest"
 *
 * Job data: {
 *   poId: string          — MongoDB _id of the PurchaseOrder record
 *   storageKey: string    — Internal storage key for the uploaded file
 *   tenantId: string      — Tenant context (always verified before file access)
 * }
 *
 * Processing steps:
 *   1. Load the PO record from MongoDB (verify tenant)
 *   2. Read file from StorageService (enforces tenant prefix)
 *   3. Run AI extraction (or mock pilot extractor if no API key)
 *   4. Update PO record with extracted fields + EXTRACTED status
 *   5. Record audit log entry
 */

import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { StorageService } from './storageService';
import { AiExtractionService } from './aiExtractionService';
import { JobQueueService } from './jobQueueService';
import { recordAudit } from './auditService';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const PO_INGEST_JOB = 'po:ingest';

async function processPOIngest(
  data: Record<string, any>,
  tenantId: string,
  jobId: string
): Promise<any> {
  const { poId, storageKey } = data;

  if (!poId || !storageKey || !tenantId) {
    throw new Error('Missing required job fields: poId, storageKey, tenantId');
  }

  console.log(`[WORKER:po:ingest] Processing PO ${poId} for tenant ${tenantId} (job: ${jobId})`);

  // 1. Verify the PO record belongs to this tenant
  const po = await PurchaseOrderModel.findOne({ _id: poId, tenantId });
  if (!po) {
    throw new Error(`PurchaseOrder ${poId} not found for tenant ${tenantId}. Possible tenant isolation violation.`);
  }

  // Mark as actively processing
  po.status = 'EXTRACTING';
  await po.save();

  // 2. Read file from storage (tenant prefix enforced inside StorageService)
  let fileBuffer: Buffer;
  try {
    fileBuffer = await StorageService.readFileInternal(storageKey, tenantId);
  } catch (storageErr: any) {
    po.status = 'EXTRACTION_FAILED';
    po.warnings = [...(po.warnings || []), `Storage read failed: ${storageErr.message}`];
    await po.save();
    throw new Error(`Storage read failed: ${storageErr.message}`);
  }

  // 3. Write to a temp file for AI extraction (Gemini needs a file path)
  const ext = path.extname(storageKey) || '.pdf';
  const tmpPath = path.join(os.tmpdir(), `invoiceai-${poId}${ext}`);
  fs.writeFileSync(tmpPath, fileBuffer);

  let extracted: any;
  try {
    extracted = await AiExtractionService.extractFromPO(
      tmpPath,
      'application/pdf',
      po.originalFileName
    );
  } finally {
    // Always clean up temp file
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }

  // 4. Populate PO record with extracted data
  po.poNumber = extracted.poNumber || po.poNumber;
  po.poDate = extracted.poDate || po.poDate;
  po.buyerName = extracted.buyerName || po.buyerName;
  po.currency = extracted.currency || po.currency;
  po.poGoodsTotal = extracted.poGoodsTotal || po.poGoodsTotal;
  po.items = extracted.items || [];
  po.warnings = [
    ...(po.warnings || []),
    ...(extracted.warnings || [])
  ];
  po.status = 'EXTRACTED';
  await po.save();

  // 5. Audit record
  await recordAudit({
    tenantId,
    actorId: 'SYSTEM_WORKER',
    actorEmail: 'system@invoiceai.internal',
    action: 'PO_UPLOADED',
    entityType: 'PURCHASE_ORDER',
    entityId: poId,
    description: `Background extraction complete for PO ${po.poNumber} via ${extracted.extractionMethod}. ` +
      `Extracted ${po.items.length} line items.`
  });

  console.log(`[WORKER:po:ingest] ✅ Completed PO ${poId}: ${po.items.length} items extracted.`);

  return {
    poId,
    poNumber: po.poNumber,
    itemCount: po.items.length,
    extractionMethod: extracted.extractionMethod,
    warnings: po.warnings
  };
}

/**
 * Register the po:ingest processor with the JobQueueService.
 * Call this during server startup.
 */
export function registerPOIngestionWorker(): void {
  JobQueueService.registerProcessor(PO_INGEST_JOB, processPOIngest);
  console.log('[WORKER] PO ingestion processor registered.');
}
