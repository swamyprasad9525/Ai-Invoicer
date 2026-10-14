import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Invoice, Tenant, Customer, PurchaseOrder } from '@invoiceai/shared';
import { config } from '../config/env';

export class TemplateService {
  /**
   * Generates a DOCX invoice binary using docxtemplater and the tenant's mapped template.
   */
  public static async generateDocx(
    invoice: Invoice,
    tenant: Tenant,
    customer: Customer,
    po?: PurchaseOrder | null
  ): Promise<Buffer> {
    const templateDir = path.resolve(__dirname, '../../templates');
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    const defaultTemplatePath = path.join(templateDir, 'swamy_slabs_template.docx');

    // Create a base valid docx if one doesn't exist yet
    if (!fs.existsSync(defaultTemplatePath)) {
      this.createDefaultDocxTemplate(defaultTemplatePath);
    }

    const content = fs.readFileSync(defaultTemplatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    // Populate data model matching mapped template keys
    const data = {
      companyName: tenant.name,
      companyGstin: tenant.gstin,
      companyAddress: `${tenant.address.street}, ${tenant.address.city}, ${tenant.address.state} - ${tenant.address.postalCode}`,
      companyPhone: tenant.phone || '',
      companyEmail: tenant.email,
      bankName: tenant.bankDetails.bankName,
      bankAccount: tenant.bankDetails.accountNumber,
      bankIfsc: tenant.bankDetails.ifscCode,
      bankBranch: tenant.bankDetails.branch || '',

      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      poNumber: po?.poNumber || '',
      poDate: po?.poDate || '',
      vehicleNumber: invoice.vehicleNumber || 'N/A',
      placeOfSupply: `${customer.shippingAddress.state} (${customer.shippingAddress.stateCode})`,

      buyerName: customer.name,
      buyerGstin: customer.gstin || 'URP',
      buyerAddress: `${customer.billingAddress.street}, ${customer.billingAddress.city}, ${customer.billingAddress.state} - ${customer.billingAddress.postalCode}`,
      shippingAddress: `${customer.shippingAddress.street}, ${customer.shippingAddress.city}, ${customer.shippingAddress.state} - ${customer.shippingAddress.postalCode}`,

      items: ((invoice as any).items || []).map((it: any) => ({
        num: it.itemNumber,
        desc: it.description + (it.patternBreakdown ? `\n${it.patternBreakdown}` : ''),
        hsn: it.hsnCode,
        qty: it.dispatchedQuantity,
        unit: it.unit,
        rate: it.rate,
        amount: it.amount,
        crates: it.crateCount ? `${it.crateCount} CRT` : ''
      })),

      subtotal: invoice.subtotal,
      isInterState: invoice.isInterState,
      cgstRate: invoice.cgstRatePercent,
      cgstAmount: invoice.cgstAmount,
      sgstRate: invoice.sgstRatePercent,
      sgstAmount: invoice.sgstAmount,
      igstRate: invoice.igstRatePercent,
      igstAmount: invoice.igstAmount,
      totalTax: invoice.totalTaxAmount,
      roundOff: invoice.roundOff,
      grandTotal: invoice.grandTotal,
      grandTotalWords: invoice.grandTotalWords,
      totalCrates: invoice.totalCrates
    };

    doc.render(data);
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return buf;
  }

  /**
   * Generates a minimal, valid Microsoft Word DOCX archive containing XML template tags.
   */
  private static createDefaultDocxTemplate(filePath: string): void {
    const zip = new PizZip();

    // Standard OpenPackagingConventions XML files for Word .docx
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>TAX INVOICE - {companyName}</w:t></w:r></w:p>
    <w:p><w:r><w:t>GSTIN: {companyGstin} | Address: {companyAddress}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Invoice No: {invoiceNumber} | Date: {invoiceDate} | PO No: {poNumber} ({poDate})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Buyer: {buyerName} | GSTIN: {buyerGstin}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Vehicle No: {vehicleNumber} | Place of Supply: {placeOfSupply}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>--------------------------------------------------------------------------------------------------------</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#items}</w:t></w:r></w:p>
    <w:p><w:r><w:t>#{num} | {desc} | HSN: {hsn} | Qty: {qty} {unit} | Rate: ₹{rate} | Amt: ₹{amount} | {crates}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/items}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:t>--------------------------------------------------------------------------------------------------------</w:t></w:r></w:p>
    <w:p><w:r><w:t>Total Crates: {totalCrates} | Subtotal: ₹{subtotal}</w:t></w:r></w:p>
    <w:p><w:r><w:t>CGST: ₹{cgstAmount} | SGST: ₹{sgstAmount} | IGST: ₹{igstAmount} | Total Tax: ₹{totalTax}</w:t></w:r></w:p>
    <w:p><w:r><w:b/><w:sz w:val="28"/><w:t>Grand Total: ₹{grandTotal}</w:t></w:r></w:p>
    <w:p><w:r><w:i/><w:t>Amount in Words: {grandTotalWords}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bank: {bankName} | A/C: {bankAccount} | IFSC: {bankIfsc}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    zip.file('[Content_Types].xml', contentTypesXml);
    zip.file('_rels/.rels', relsXml);
    zip.file('word/document.xml', documentXml);

    const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, buffer);
  }
}
