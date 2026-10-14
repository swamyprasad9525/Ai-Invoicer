import { Router, Request, Response } from 'express';
import { InvoiceModel } from '../models/Invoice';
import { TenantModel } from '../models/Tenant';
import { CustomerModel } from '../models/Customer';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { TemplateService } from '../services/templateService';
import { calculateGST, multiplyMoney, amountToIndianWords } from '@invoiceai/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit } from '../services/auditService';

export const invoiceRouter = Router();

// List Invoices
invoiceRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoices = await InvoiceModel.find({ tenantId: req.tenantId })
      .populate('customerId', 'name gstin')
      .populate('purchaseOrderId', 'poNumber poDate')
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Invoice by ID
invoiceRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('customerId')
      .populate('purchaseOrderId');

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update draft invoice (dispatched quantity, rate, vehicle number)
invoiceRouter.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    if (invoice.status === 'ISSUED') {
      res.status(400).json({ error: 'Invariant Violation: An issued invoice is immutable and cannot be edited.' });
      return;
    }

    const before = invoice.toObject();

    if (req.body.vehicleNumber !== undefined) invoice.vehicleNumber = req.body.vehicleNumber;
    if (req.body.lrNumber !== undefined) invoice.lrNumber = req.body.lrNumber;
    if (req.body.invoiceDate !== undefined) invoice.invoiceDate = req.body.invoiceDate;

    // If items are modified, recalculate line amounts and GST
    if (req.body.items && Array.isArray(req.body.items)) {
      let subtotal = 0;
      let totalCrates = 0;

      (invoice as any).items = req.body.items.map((it: any, idx: number) => {
        const rate = it.rate || '0.00';
        const qty = it.dispatchedQuantity || it.orderedQuantity || '0.00';
        const lineAmt = multiplyMoney(qty, rate);
        subtotal += parseFloat(lineAmt);
        totalCrates += it.crateCount || 0;

        return {
          ...it,
          itemNumber: idx + 1,
          amount: lineAmt
        };
      });

      invoice.subtotal = subtotal.toFixed(2);
      invoice.totalCrates = totalCrates;

      const gst = calculateGST(
        invoice.subtotal,
        invoice.isInterState,
        invoice.taxRatePercent || 18
      );

      invoice.cgstRatePercent = gst.cgstRate;
      invoice.cgstAmount = gst.cgstAmount;
      invoice.sgstRatePercent = gst.sgstRate;
      invoice.sgstAmount = gst.sgstAmount;
      invoice.igstRatePercent = gst.igstRate;
      invoice.igstAmount = gst.igstAmount;
      invoice.totalTaxAmount = gst.totalTax;
      invoice.roundOff = gst.roundOff;
      invoice.grandTotal = gst.grandTotal;
      invoice.grandTotalWords = amountToIndianWords(gst.grandTotal);
    }

    await invoice.save();

    await recordAudit({
      tenantId: req.tenantId!,
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      action: 'DISPATCH_CONFIRMED',
      entityType: 'INVOICE',
      entityId: invoice._id.toString(),
      description: `Updated invoice draft ${invoice.invoiceNumber}`,
      beforeSnapshot: before,
      afterSnapshot: invoice.toObject()
    });

    res.json(invoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Approve Invoice
invoiceRouter.post(
  '/:id/approve',
  requireAuth,
  requireRole(['OWNER_ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const invoice = await InvoiceModel.findOne({
        _id: req.params.id,
        tenantId: req.tenantId
      });

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found.' });
        return;
      }

      invoice.status = 'APPROVED';
      invoice.approvedBy = req.user!.email;
      invoice.approvedAt = new Date();
      await invoice.save();

      await recordAudit({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'INVOICE_APPROVED',
        entityType: 'INVOICE',
        entityId: invoice._id.toString(),
        description: `Approved invoice ${invoice.invoiceNumber}`
      });

      res.json(invoice);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Issue Invoice (Atomic Concurrency-safe sequential numbering & immutable snapshot)
invoiceRouter.post(
  '/:id/issue',
  requireAuth,
  requireRole(['OWNER_ADMIN', 'ACCOUNTS_EXECUTIVE']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const invoice = await InvoiceModel.findOne({
        _id: req.params.id,
        tenantId: req.tenantId
      });

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found.' });
        return;
      }

      if (invoice.status === 'ISSUED') {
        // Idempotency: Return existing issued record
        res.json(invoice);
        return;
      }

      // Atomic increment of sequence number on Tenant
      const tenant = await TenantModel.findOneAndUpdate(
        { _id: req.tenantId },
        { $inc: { 'invoiceSettings.nextSequenceNumber': 1 } },
        { new: false } // return state before update to get current sequence
      );

      if (!tenant) {
        res.status(404).json({ error: 'Tenant settings not found.' });
        return;
      }

      const seq = tenant.invoiceSettings.nextSequenceNumber || 1;
      const paddedSeq = String(seq).padStart(4, '0');
      const prefix = tenant.invoiceSettings.invoicePrefix || 'INV';
      const fy = tenant.invoiceSettings.financialYear || '2026-27';
      const officialInvoiceNumber = `${prefix}/${fy}/${paddedSeq}`;

      invoice.invoiceNumber = officialInvoiceNumber;
      invoice.status = 'ISSUED';
      invoice.issuedAt = new Date();
      invoice.approvedBy = req.user!.email;

      // Freeze immutable snapshot
      invoice.immutableIssuedSnapshot = invoice.toObject();

      await invoice.save();

      // Update linked PO status to ISSUED
      await PurchaseOrderModel.findByIdAndUpdate(invoice.purchaseOrderId, { status: 'ISSUED' });

      await recordAudit({
        tenantId: req.tenantId!,
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        action: 'INVOICE_ISSUED',
        entityType: 'INVOICE',
        entityId: invoice._id.toString(),
        description: `Formally issued invoice ${officialInvoiceNumber}`
      });

      res.json(invoice);
    } catch (err: any) {
      console.error('[INVOICE_ISSUE_ERROR]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// Download Invoice as DOCX or HTML
invoiceRouter.get('/:id/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const invoice = await InvoiceModel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    const tenant = await TenantModel.findById(req.tenantId);
    const customer = await CustomerModel.findById(invoice.customerId);
    const po = await PurchaseOrderModel.findById(invoice.purchaseOrderId);

    if (!tenant || !customer) {
      res.status(404).json({ error: 'Tenant or customer records missing.' });
      return;
    }

    const format = req.query.format || 'docx';

    if (format === 'docx') {
      const buffer = await TemplateService.generateDocx(
        invoice.toObject() as any,
        tenant.toObject() as any,
        customer.toObject() as any,
        po?.toObject() as any
      );

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber.replace(/\//g, '_')}.docx"`);
      res.send(buffer);
      return;
    }

    // Default JSON / preview
    res.json({
      invoice,
      tenant,
      customer,
      po
    });
  } catch (err: any) {
    console.error('[DOWNLOAD_ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});
