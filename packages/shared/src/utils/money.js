"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDecimal = toDecimal;
exports.formatMoney = formatMoney;
exports.multiplyMoney = multiplyMoney;
exports.calculateGST = calculateGST;
const decimal_js_1 = __importDefault(require("decimal.js"));
// Configure Decimal.js for strict financial rounding (ROUND_HALF_UP)
decimal_js_1.default.set({ precision: 20, rounding: decimal_js_1.default.ROUND_HALF_UP });
function toDecimal(val) {
    if (val instanceof decimal_js_1.default)
        return val;
    const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : String(val);
    if (!cleaned || isNaN(Number(cleaned)))
        return new decimal_js_1.default(0);
    return new decimal_js_1.default(cleaned);
}
function formatMoney(val, decimals = 2) {
    const d = toDecimal(val);
    return d.toFixed(decimals);
}
function multiplyMoney(qty, rate) {
    const q = toDecimal(qty);
    const r = toDecimal(rate);
    return q.times(r).toFixed(2);
}
function calculateGST(subtotal, isInterState, ratePercent = 18) {
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
    }
    else {
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
