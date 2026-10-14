import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { CustomerModel } from '../models/Customer';
import { DescriptionRuleModel } from '../models/DescriptionRule';
import { TenantModel } from '../models/Tenant';
import { InvoiceModel } from '../models/Invoice';
import { AiExtractionService } from '../services/aiExtractionService';
import { DescriptionRuleEngine } from '../services/ruleEngine';
import { calculateGST, multiplyMoney, amountToIndianWords } from '@invoiceai/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit } from '../services/auditService';
import { config } from '../config/env';

// Ensure upload directory exists
if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB
});

export const purchaseOrderRouter = Router();

// Upload PO document
purchaseOrderRouter.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded.' });
        return;
      }

      const fileBuffer = fs.readFileSync(req.file.path);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // Deduplication check
      const existingPO = await PurchaseOrderModel.findOne({
        tenantId: req.tenantId,
        fileHash
      });

      if (existingPO) {
        res.status(409).json({
          error: 'Duplicate document detected: This exact file has already been uploaded.',
          existingPOId: existingPO._id,
          poNumber: existingPO.poNumber
        });
        return;
      }

      // Check customer linkage if provided
      let customerId = req.body.customerId;
      if (!customerId) {
        const customer = await CustomerModel.findOne({ tenantId: req.tenantId });
        customerId = customer?._id;
      }

      // Perform extraction
      const extracted = await AiExtractionService.extractFromPO(
        req.file.path,
        req.file.mimetype,
        req.file.originalname
      );

      // Create Purchase Order record
      const po = await PurchaseOrderModel.create({
        tenantId: req.tenantId,
        customerId,
        sourceFileId: req.file.filename,
        fileHash,
        originalFileName: req.file.originalname,
        poNumber: extracted.poNumber,
        poDate: extracted.poDate,
        currency: extracted.currency || 'INR',
        buyerName: extracted.buyerName,
        poGoodsTotal: extracted.poGoodsTotal,
        status: 'EXTRACTED',
        items: extracted.items,
        warnings: extracted.warnings
      });

      await recordAudit({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'PO_UPLOADED',
        entityType: 'PURCHASE_ORDER',
        entityId: po._id.toString(),
        description: `Uploaded and extracted PO ${po.poNumber} (${extracted.items.length} items) via ${extracted.extractionMethod}`
      });

      res.status(201).json(po);
    } catch (err: any) {
      console.error('[PO_UPLOAD_ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// List POs
purchaseOrderRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const pos = await PurchaseOrderModel.find({ tenantId: req.tenantId })
      .populate('customerId', 'name gstin')
      .sort({ createdAt: -1 });
    res.json(pos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get single PO by ID
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

// Update / Correct PO line items
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

// Generate Invoice Draft from PO
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

      const tenant = await TenantModel.findById(req.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant configuration not found.' });
        return;
      }

      // Retrieve customer
      let customer = null;
      if (po.customerId) {
        customer = await CustomerModel.findById(po.customerId);
      }
      if (!customer) {
        customer = await CustomerModel.findOne({ tenantId: req.tenantId });
      }

      // Retrieve latest Description Rules
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

      // Convert PO items to Invoice items with commercial descriptions
      let calculatedSubtotal = 0;
      let totalCrates = 0;

      const invoiceItems = po.items.map((item: any, idx: number) => {
        const itemObj = typeof item.toObject === 'function' ? item.toObject() : item;
        const transformed = DescriptionRuleEngine.transform(itemObj, defaultRule as any);

        const dispatchedQty = item.orderedQuantity; // Default initial dispatched = ordered, can be overridden by dispatch
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

      // Calculate GST
      const supplierStateCode = tenant.address.stateCode;
      const placeOfSupplyCode = customer?.shippingAddress?.stateCode || supplierStateCode;
      const isInterState = supplierStateCode !== placeOfSupplyCode;

      const gst = calculateGST(calculatedSubtotal.toFixed(2), isInterState, tenant.invoiceSettings.defaultTaxRatePercent || 18);

      const invoiceNumber = `DRAFT-${po.poNumber}`;
      const grandTotalWords = amountToIndianWords(gst.grandTotal);

      // Create Draft Invoice
      const invoice = await InvoiceModel.create({
        tenantId: req.tenantId,
        purchaseOrderId: po._id,
        customerId: customer?._id,
        invoiceNumber,
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + (tenant.invoiceSettings.paymentTermsDays || 30) * 86400000).toISOString().split('T')[0],
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
        description: `Generated invoice draft from PO ${po.poNumber} with ${invoiceItems.length} items.`
      });

      res.status(201).json(invoice);
    } catch (err: any) {
      console.error('[GENERATE_DRAFT_ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  }
);
