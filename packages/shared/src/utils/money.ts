import Decimal from 'decimal.js';

// Configure Decimal.js for strict financial rounding (ROUND_HALF_UP)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(val: string | number | Decimal): Decimal {
  if (val instanceof Decimal) return val;
  const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : String(val);
  if (!cleaned || isNaN(Number(cleaned))) return new Decimal(0);
  return new Decimal(cleaned);
}

export function formatMoney(val: string | number | Decimal, decimals: number = 2): string {
  const d = toDecimal(val);
  return d.toFixed(decimals);
}

export function multiplyMoney(qty: string | number, rate: string | number): string {
  const q = toDecimal(qty);
  const r = toDecimal(rate);
  return q.times(r).toFixed(2);
}

export function calculateGST(
  subtotal: string | number,
  isInterState: boolean,
  ratePercent: number = 18
): {
  cgstRate: number;
  cgstAmount: string;
  sgstRate: number;
  sgstAmount: string;
  igstRate: number;
  igstAmount: string;
  totalTax: string;
  grandTotal: string;
  roundOff: string;
} {
  const base = toDecimal(subtotal);
  const taxPct = toDecimal(ratePercent);

  if (isInterState) {
    const igst = base.times(taxPct).dividedBy(100);
    const unroundedGrand = base.plus(igst);
    const roundedGrand = unroundedGrand.round();
    const roundOff = roundedGrand.minus(unroundedGrand);

    return {
      cgstRate: 0,
      cgstAmount: '0.00',
      sgstRate: 0,
      sgstAmount: '0.00',
      igstRate: ratePercent,
      igstAmount: igst.toFixed(2),
      totalTax: igst.toFixed(2),
      grandTotal: roundedGrand.toFixed(2),
      roundOff: roundOff.toFixed(2)
    };
  } else {
    const halfRate = ratePercent / 2;
    const halfPct = toDecimal(halfRate);
    const cgst = base.times(halfPct).dividedBy(100);
    const sgst = base.times(halfPct).dividedBy(100);
    const totalTax = cgst.plus(sgst);
    const unroundedGrand = base.plus(totalTax);
    const roundedGrand = unroundedGrand.round();
    const roundOff = roundedGrand.minus(unroundedGrand);

    return {
      cgstRate: halfRate,
      cgstAmount: cgst.toFixed(2),
      sgstRate: halfRate,
      sgstAmount: sgst.toFixed(2),
      igstRate: 0,
      igstAmount: '0.00',
      totalTax: totalTax.toFixed(2),
      grandTotal: roundedGrand.toFixed(2),
      roundOff: roundOff.toFixed(2)
    };
  }
}
