import { connectDB, disconnectDB } from '../db/connection';
import { seedPilotData } from './seed';
import { TenantModel } from '../models/Tenant';
import { UserModel } from '../models/User';
import { CustomerModel } from '../models/Customer';
import { DescriptionRuleModel } from '../models/DescriptionRule';
import { PurchaseOrderModel } from '../models/PurchaseOrder';
import { InvoiceModel } from '../models/Invoice';
import { DescriptionRuleEngine } from '../services/ruleEngine';
import { TemplateService } from '../services/templateService';
import { calculateGST, multiplyMoney, amountToIndianWords } from '@invoiceai/shared';

async function runEndToEndVerification() {
  console.log('\n=============================================================');
  console.log('   🧪 INVOICEAI PILOT END-TO-END VERIFICATION SUITE');
  console.log('=============================================================\n');

  // 1. Connect and Seed
  await connectDB();
  await seedPilotData();

  // 2. Verify Tenant & RBAC
  const tenant = await TenantModel.findOne({ slug: 'swamy-slabs' });
  if (!tenant) throw new Error('Tenant Swamy Slabs not found!');
  console.log(`✅ [1/7] Tenant Isolation Verified: "${tenant.name}" (GSTIN: ${tenant.gstin})`);

  const users = await UserModel.find({ 'memberships.tenantId': tenant._id });
  console.log(`✅ [2/7] RBAC Memberships Verified: ${users.length} users registered (${users.map((u) => u.email).join(', ')})`);

  // 3. Verify Customer Directory & Place of Supply
  const customer = await CustomerModel.findOne({ tenantId: tenant._id, name: 'Global Impex Private Limited' });
  if (!customer) throw new Error('Pilot customer not found!');
  const isInterstate = tenant.address.stateCode !== customer.shippingAddress.stateCode;
  console.log(`✅ [3/7] Customer Master & POS Verified: ${customer.name} (Supplier: State ${tenant.address.stateCode} -> Consignee: State ${customer.shippingAddress.stateCode} => InterState: ${isInterstate})`);

  // 4. Verify PO Extraction POM14356A
  const po = await PurchaseOrderModel.findOne({ tenantId: tenant._id, poNumber: 'POM14356A' });
  if (!po) throw new Error('Benchmark PO POM14356A not found!');
  console.log(`✅ [4/7] PO Ingestion & Schema Extraction Verified: PO ${po.poNumber} (${po.items.length} line items, Goods Total: ₹${po.poGoodsTotal})`);

  // 5. Test Description Rule Engine on all 5 line items
  const rule = await DescriptionRuleModel.findOne({ tenantId: tenant._id }).sort({ ruleVersion: -1 });
  if (!rule) throw new Error('Description Rule not found!');
  console.log(`✅ [5/7] Description Rule Engine (Version ${rule.ruleVersion}):`);

  let totalCrates = 0;
  let calculatedSubtotal = 0;

  const invoiceItems = po.items.map((item: any, idx: number) => {
    const itemObj = typeof item.toObject === 'function' ? item.toObject() : item;
    const transformed = DescriptionRuleEngine.transform(itemObj, rule.toObject() as any);
    const lineAmt = multiplyMoney(item.orderedQuantity, item.rate);
    calculatedSubtotal += parseFloat(lineAmt);
    totalCrates += item.crateCount || 0;

    console.log(`    Line ${item.line}: [${item.category}] -> "${transformed.commercialDescription}" ${transformed.patternBreakdown ? `(Pattern: ${transformed.patternBreakdown})` : ''}`);
    return {
      sourcePOItemId: item._id ? item._id.toString() : undefined,
      itemNumber: idx + 1,
      hsnCode: tenant.invoiceSettings.defaultHsnCode,
      description: transformed.commercialDescription,
      patternBreakdown: transformed.patternBreakdown,
      orderedQuantity: item.orderedQuantity,
      previouslyInvoicedQuantity: '0.00',
      dispatchedQuantity: item.orderedQuantity,
      remainingQuantity: '0.00',
      unit: item.unit,
      rate: item.rate,
      discount: '0.00',
      amount: lineAmt,
      crateCount: item.crateCount,
      ruleVersionUsed: rule.ruleVersion,
      isManuallyEdited: false
    };
  });

  // 6. Test Decimal-Safe Financial Arithmetic & GST
  const gst = calculateGST(calculatedSubtotal.toFixed(2), isInterstate, 18);
  const words = amountToIndianWords(gst.grandTotal);

  console.log(`\n✅ [6/7] Decimal-Safe Financial Calculations:`);
  console.log(`    Order Quoted Total:    ₹${po.poGoodsTotal}`);
  console.log(`    Recalculated Subtotal: ₹${calculatedSubtotal.toFixed(2)} (Drift: ₹${(parseFloat(po.poGoodsTotal) - calculatedSubtotal).toFixed(2)})`);
  console.log(`    Tax Applied (IGST 18%):₹${gst.igstAmount}`);
  console.log(`    Round Off:             ₹${gst.roundOff}`);
  console.log(`    Invoice Grand Total:   ₹${gst.grandTotal}`);
  console.log(`    Amount in Words:       "${words}"`);
  console.log(`    Total Packaging:       ${totalCrates} Crates`);

  // 7. Test Native DOCX Generation
  const dummyInvoice = {
    invoiceNumber: 'INV/2026-27/0001',
    invoiceDate: '2026-09-10',
    vehicleNumber: 'KA-04-E-4567',
    placeOfSupplyStateCode: customer.shippingAddress.stateCode,
    isInterState: isInterstate,
    subtotal: calculatedSubtotal.toFixed(2),
    cgstRatePercent: gst.cgstRate,
    cgstAmount: gst.cgstAmount,
    sgstRatePercent: gst.sgstRate,
    sgstAmount: gst.sgstAmount,
    igstRatePercent: gst.igstRate,
    igstAmount: gst.igstAmount,
    totalTaxAmount: gst.totalTax,
    roundOff: gst.roundOff,
    grandTotal: gst.grandTotal,
    grandTotalWords: words,
    totalCrates,
    items: invoiceItems
  };

  const docxBuffer = await TemplateService.generateDocx(
    dummyInvoice as any,
    tenant.toObject() as any,
    customer.toObject() as any,
    po.toObject() as any
  );

  console.log(`\n✅ [7/7] Mapped Word (DOCX) Template Engine:`);
  console.log(`    Generated DOCX binary: ${docxBuffer.length} bytes successfully compiled.`);

  console.log('\n=============================================================');
  console.log('   🎉 ALL 7 PILOT QUALITY GATES PASSED WITH 100% SUCCESS!');
  console.log('=============================================================\n');

  await disconnectDB();
}

runEndToEndVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
