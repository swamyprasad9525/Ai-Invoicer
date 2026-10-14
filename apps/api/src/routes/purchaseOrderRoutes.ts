/**
 * Purchase Order Routes — Chunk 2 implementation.
 *
 * Endpoints:
 *   POST  /api/purchase-orders/upload       — Upload + validate + ingest PO PDF
 *   GET   /api/purchase-orders              — List POs (tenant-scoped)
 *   GET   /api/purchase-orders/:id          — Get single PO
 *   GET   /api/purchase-orders/:id/download — Issue signed download token
 *   GET   /api/purchase-orders/signed/:token — Serve file via signed token
 *   PATCH /api/purchase-orders/:id          — Correct PO items
 *   POST  /api/purchase-orders/:id/generate-draft — Generate invoice draft
 *   GET   /api/purchase-orders/jobs         — List background jobs for tenant
 *   GET   /api/purchase-orders/jobs/:jobId  — Get specific job status
 *   POST  /api/purchase-orders/jobs/:jobId/retry — Retry a failed job
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { CustomerModel } from '../models/Customer';
import { DescriptionRuleModel } from '../models/DescriptionRule';
import { TenantModel } from '../models/Tenant';
import { InvoiceModel } from '../models/Invoice';
import { StorageService } from '../services/storageService';
import { FileValidationService, FILE_LIMITS } from '../services/fileValidationService';
import { JobQueueService } from '../services/jobQueueService';
import { PO_INGEST_JOB } from '../services/poIngestionWorker';
import { DescriptionRuleEngine } from '../services/ruleEngine';
import { calculateGST, multiplyMoney, amountToIndianWords } from '@invoiceai/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit } from '../services/auditService';

// ─── Multer — memory storage (validation happens before writing to disk/S3) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: FILE_LIMITS.maxFileSizeBytes }
});

export const purchaseOrderRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /upload — Validate, store, and queue PO for background extraction
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file attached. Include the file as a "file" multipart field.' });
        return;
      }

      const fileBuffer = req.file.buffer;

      // ── Validate file ────────────────────────────────────────────────────
      const validation = FileValidationService.validate(
        fileBuffer,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      );

      if (!validation.valid) {
        res.status(422).json({
          error: 'File validation failed.',
          validationErrors: validation.errors,
          warnings: validation.warnings
        });
        return;
      }

      const tenantId = req.tenantId!;
      const fileHash = validation.fileHash;

      // ── Duplicate detection ───────────────────────────────────────────────
      const existingPO = await PurchaseOrderModel.findOne({ tenantId, fileHash });
      const isDuplicate = !!existingPO;
      const forceUpload = req.body.forceUpload === 'true';

      if (isDuplicate && !forceUpload) {
        res.status(409).json({
          error: 'Duplicate document detected.',
          isDuplicate: true,
          existingPOId: existingPO!._id,
          existingPONumber: existingPO!.poNumber,
          existingStatus: existingPO!.status,
          warnings: validation.warnings,
          message:
            'This exact file has already been uploaded. If this is a revised order or partial dispatch, ' +
            'submit again with forceUpload=true to proceed.',
          hint: 'Set forceUpload=true in the form body to bypass duplicate check for legitimate partial/revised orders.'
        });
        return;
      }

      // ── Tenant PO count limit ────────────────────────────────────────────
      const poCount = await PurchaseOrderModel.countDocuments({ tenantId });
      if (poCount >= FILE_LIMITS.maxPOsPerTenant) {
        res.status(429).json({
          error: `Document limit reached: your account has ${poCount} purchase orders. Maximum is ${FILE_LIMITS.maxPOsPerTenant}.`
        });
        return;
      }

      // ── Link to customer ─────────────────────────────────────────────────
      let customerId = req.body.customerId || null;
      if (customerId) {
        const customer = await CustomerModel.findOne({ _id: customerId, tenantId });
        if (!customer) {
          res.status(404).json({ error: 'Customer not found in your company directory.' });
          return;
        }
      } else {
        const firstCustomer = await CustomerModel.findOne({ tenantId, isActive: true });
        customerId = firstCustomer?._id || null;
      }

      // ── Store file securely ──────────────────────────────────────────────
      const stored = await StorageService.storeFile({
        tenantId,
        fileBuffer,
        originalFileName: req.file.originalname,
        mimeType: validation.detectedMimeType || 'application/pdf',
        fileHash
      });

      // ── Create PO record (status: UPLOADED, items empty) ─────────────────
      const po = await PurchaseOrderModel.create({
        tenantId,
        customerId,
        sourceFileId: stored.storageKey,
        fileHash,
        originalFileName: req.file.originalname,
        poNumber: `PO-PENDING-${Date.now()}`, // placeholder until extraction
        poDate: new Date().toISOString().split('T')[0],
        currency: 'INR',
        buyerName: 'Pending Extraction',
        poGoodsTotal: '0.00',
        status: 'UPLOADED',
        items: [],
        warnings: [
          ...(validation.warnings || []),
          ...(isDuplicate && forceUpload ? ['Force-uploaded duplicate document: original PO ID = ' + existingPO!._id] : []),
          ...(validation.isSuspicious ? [`QUARANTINE FLAG: ${validation.suspicionReason}`] : [])
        ],
        version: 1
      });

      // ── Enqueue background ingestion job ─────────────────────────────────
      const jobId = await JobQueueService.enqueue({
        name: PO_INGEST_JOB,
        data: {
          poId: po._id.toString(),
          storageKey: stored.storageKey
        },
        tenantId,
        maxAttempts: 3
      });

      await recordAudit({
        tenantId,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PO_UPLOADED',
        entityType: 'PURCHASE_ORDER',
        entityId: po._id.toString(),
        description: `PO file uploaded: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB). ` +
          `Hash: ${fileHash.substring(0, 16)}... | Storage: ${stored.storageBackend} | ` +
          `Suspicious: ${validation.isSuspicious} | JobID: ${jobId}`
      });

      res.status(201).json({
        po,
        jobId,
        storageBackend: stored.storageBackend,
        isDuplicateOverridden: isDuplicate && forceUpload,
        isSuspicious: validation.isSuspicious,
        suspicionReason: validation.suspicionReason,
        warnings: validation.warnings,
        message: 'PO uploaded and queued for background extraction. Poll /api/purchase-orders/:id for status updates.'
      });
    } catch (err: any) {
      console.error('[PO_UPLOAD_ERROR]', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: `File too large. Maximum allowed size is ${FILE_LIMITS.maxFileSizeMB} MB.`
        });
        return;
      }
      res.status(500).json({ error: err.message || 'Upload failed.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /signed/:token — Serve document via one-time signed token (no public URL)
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get(
  '/signed/:token',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await StorageService.resolveSignedToken(
        req.params.token,
        req.tenantId!
      );

      if (!result) {
        res.status(403).json({
          error: 'Invalid or expired download token. Request a new download link.'
        });
        return;
      }

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.fileName)}"`
      );
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(result.buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /jobs — Background job history for this tenant
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get(
  '/jobs',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /jobs/:jobId — Specific job status
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get(
  '/jobs/:jobId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const job = await JobQueueService.getJob(req.params.jobId, req.tenantId!);
      if (!job) {
        res.status(404).json({ error: 'Job not found.' });
        return;
      }
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /jobs/:jobId/retry — Retry a failed job
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.post(
  '/jobs/:jobId/retry',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const newJobId = await JobQueueService.retryJob(req.params.jobId, req.tenantId!);

      await recordAudit({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PO_UPLOADED', // Reuse closest action
        entityType: 'PURCHASE_ORDER',
        entityId: req.params.jobId,
        description: `Manual retry of failed job ${req.params.jobId}. New job: ${newJobId}`
      });

      res.json({ success: true, newJobId, message: 'Job queued for retry.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET / — List POs (tenant-scoped)
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const pos = await PurchaseOrderModel.find({ tenantId: req.tenantId })
      .populate('customerId', 'name gstin shippingAddress')
      .sort({ createdAt: -1 });
    res.json(pos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id — Single PO
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await PurchaseOrderModel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('customerId');

    if (!po) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }
    res.json(po);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:id/download — Issue short-lived signed download token
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.get(
  '/:id/download',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const po = await PurchaseOrderModel.findOne({
        _id: req.params.id,
        tenantId: req.tenantId
      });

      if (!po) {
        res.status(404).json({ error: 'Purchase Order not found.' });
        return;
      }

      const token = await StorageService.generateSignedDownloadToken(
        po.sourceFileId,
        req.tenantId!
      );

      res.json({
        token,
        downloadUrl: `/api/purchase-orders/signed/${token}`,
        expiresInSeconds: 900, // 15 minutes
        fileName: po.originalFileName,
        warning: 'This URL expires in 15 minutes and is single-use. Request a new token after expiry.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id — Update/correct PO items
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const po = await PurchaseOrderModel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!po) {
      res.status(404).json({ error: 'Purchase Order not found.' });
      return;
    }

    const before = po.toObject();
    if (req.body.items) po.items = req.body.items;
    if (req.body.poNumber) po.poNumber = req.body.poNumber;
    if (req.body.buyerName) po.buyerName = req.body.buyerName;
    if (req.body.poGoodsTotal) po.poGoodsTotal = req.body.poGoodsTotal;
    if (req.body.warnings) po.warnings = req.body.warnings;

    await po.save();

    await recordAudit({
      tenantId: req.tenantId!,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'PO_ITEM_CORRECTED',
      entityType: 'PURCHASE_ORDER',
      entityId: po._id.toString(),
      description: `Corrected line items on PO ${po.poNumber}`,
      beforeSnapshot: before,
      afterSnapshot: po.toObject()
    });

    res.json(po);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:id/generate-draft — Generate Invoice Draft from PO
// ─────────────────────────────────────────────────────────────────────────────
purchaseOrderRouter.post(
  '/:id/generate-draft',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const po = await PurchaseOrderModel.findOne({
        _id: req.params.id,
        tenantId: req.tenantId
      });

      if (!po) {
        res.status(404).json({ error: 'Purchase Order not found.' });
        return;
      }

      if (po.status === 'UPLOADED' || po.status === 'EXTRACTING') {
        res.status(409).json({
          error: 'PO is still being processed. Wait for status to reach EXTRACTED before generating a draft.',
          currentStatus: po.status
        });
        return;
      }

      const tenant = await TenantModel.findById(req.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant configuration not found.' });
        return;
      }

      let customer = null;
      if (po.customerId) {
        customer = await CustomerModel.findById(po.customerId);
      }
      if (!customer) {
        customer = await CustomerModel.findOne({ tenantId: req.tenantId });
      }

      const rule = await DescriptionRuleModel.findOne({ tenantId: req.tenantId }).sort({ ruleVersion: -1 });

      const defaultRule = rule?.toObject() || {
        tenantId: req.tenantId!,
        companyName: tenant.name,
        ruleVersion: 1,
        fieldOrder: ['stone', 'pattern', 'size', 'thickness', 'topFinish', 'edgeFinish', 'finalFinish', 'crateCount'],
        aliases: {
          'Tandur Yellow Limestone': 'T.YELLOW',
          'T. Yellow': 'T.YELLOW',
          'Half Honed': 'H/H',
          'Tumbled': 'T/B',
          'Handcut': 'H/C',
          'Straight Handcut': 'H/C',
          'Brushed': 'BRUSHED'
        },
        categoryPolicies: [{ category: 'French Opus', includePatternBreakdown: true }],
        crateSuffix: 'CRT',
        unknownTermPolicy: 'review_required' as const,
        isApproved: true
      };

      let calculatedSubtotal = 0;
      let totalCrates = 0;

      const invoiceItems = po.items.map((item: any, idx: number) => {
        const itemObj = typeof item.toObject === 'function' ? item.toObject() : item;
        const transformed = DescriptionRuleEngine.transform(itemObj, defaultRule as any);
        const dispatchedQty = item.orderedQuantity;
        const rate = item.rate;
        const lineAmount = multiplyMoney(dispatchedQty, rate);
        calculatedSubtotal += parseFloat(lineAmount);
        totalCrates += item.crateCount || 0;

        return {
          sourcePOItemId: item._id ? item._id.toString() : undefined,
          itemNumber: idx + 1,
          hsnCode: tenant.invoiceSettings.defaultHsnCode || '6802',
          description: transformed.commercialDescription,
          patternBreakdown: transformed.patternBreakdown,
          orderedQuantity: item.orderedQuantity,
          previouslyInvoicedQuantity: '0.00',
          dispatchedQuantity: dispatchedQty,
          remainingQuantity: '0.00',
          unit: item.unit || 'SQM',
          rate: item.rate,
          discount: '0.00',
          amount: lineAmount,
          crateCount: item.crateCount || 0,
          ruleVersionUsed: transformed.appliedRuleVersion,
          isManuallyEdited: false
        };
      });

      const supplierStateCode = tenant.address.stateCode;
      const placeOfSupplyCode = customer?.shippingAddress?.stateCode || supplierStateCode;
      const isInterState = supplierStateCode !== placeOfSupplyCode;
      const gst = calculateGST(
        calculatedSubtotal.toFixed(2),
        isInterState,
        tenant.invoiceSettings.defaultTaxRatePercent || 18
      );

      const invoiceNumber = `DRAFT-${po.poNumber}`;
      const grandTotalWords = amountToIndianWords(gst.grandTotal);

      const invoice = await InvoiceModel.create({
        tenantId: req.tenantId,
        purchaseOrderId: po._id,
        customerId: customer?._id,
        invoiceNumber,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(
          Date.now() + (tenant.invoiceSettings.paymentTermsDays || 30) * 86400000
        ).toISOString().split('T')[0],
        placeOfSupplyStateCode: placeOfSupplyCode,
        isInterState,
        items: invoiceItems,
        subtotal: calculatedSubtotal.toFixed(2),
        taxRatePercent: tenant.invoiceSettings.defaultTaxRatePercent || 18,
        cgstRatePercent: gst.cgstRate,
        cgstAmount: gst.cgstAmount,
        sgstRatePercent: gst.sgstRate,
        sgstAmount: gst.sgstAmount,
        igstRatePercent: gst.igstRate,
        igstAmount: gst.igstAmount,
        totalTaxAmount: gst.totalTax,
        roundOff: gst.roundOff,
        grandTotal: gst.grandTotal,
        grandTotalWords,
        totalCrates,
        status: 'DRAFT',
        templateVersionUsed: 1
      });

      po.status = 'DRAFT';
      await po.save();

      await recordAudit({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'DRAFT_GENERATED',
        entityType: 'INVOICE',
        entityId: invoice._id.toString(),
        description: `Generated invoice draft ${invoiceNumber} from PO ${po.poNumber} with ${invoiceItems.length} items.`
      });

      res.status(201).json(invoice);
    } catch (err: any) {
      console.error('[GENERATE_DRAFT_ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  }
);
