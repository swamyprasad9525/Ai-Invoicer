import React, { useState } from 'react';
import {
  FileText,
  Download,
  CheckCircle,
  Truck,
  Building,
  ShieldCheck,
  Save,
  Lock,
  ArrowLeft,
  Loader2,
  Calendar
} from 'lucide-react';
import { ApiClient } from '../lib/api';

interface InvoiceEditorViewProps {
  invoices: any[];
  selectedInvoiceId?: string;
  onRefresh: () => void;
}

export const InvoiceEditorView: React.FC<InvoiceEditorViewProps> = ({
  invoices,
  selectedInvoiceId,
  onRefresh
}) => {
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(
    selectedInvoiceId || invoices[0]?._id || null
  );
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [lrNumber, setLrNumber] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [issuing, setIssuing] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  const activeInvoice = invoices.find((i) => i._id === activeInvoiceId) || invoices[0];

  const handleUpdateDispatch = async (idx: number, newDispatchedQty: string) => {
    if (!activeInvoice || activeInvoice.status === 'ISSUED') return;

    const updatedItems = [...activeInvoice.items];
    updatedItems[idx].dispatchedQuantity = newDispatchedQty;

    try {
      setSaving(true);
      await ApiClient.updateInvoice(activeInvoice._id, {
        items: updatedItems,
        vehicleNumber: vehicleNumber || activeInvoice.vehicleNumber,
        lrNumber: lrNumber || activeInvoice.lrNumber
      });
      onRefresh();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHeaderDetails = async () => {
    if (!activeInvoice || activeInvoice.status === 'ISSUED') return;
    try {
      setSaving(true);
      await ApiClient.updateInvoice(activeInvoice._id, {
        vehicleNumber,
        lrNumber
      });
      alert('Vehicle and dispatch details saved.');
      onRefresh();
    } catch (err: any) {
      alert(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!activeInvoice) return;
    try {
      setApproving(true);
      await ApiClient.approveInvoice(activeInvoice._id);
      onRefresh();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const handleIssue = async () => {
    if (!activeInvoice) return;
    if (!confirm('Are you sure you want to officially ISSUE this invoice? This will assign an immutable sequential invoice number and freeze the record.')) {
      return;
    }

    try {
      setIssuing(true);
      await ApiClient.issueInvoice(activeInvoice._id);
      alert('Invoice successfully issued with sequential number!');
      onRefresh();
    } catch (err: any) {
      alert(`Issuance failed: ${err.message}`);
    } finally {
      setIssuing(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!activeInvoice) return;
    try {
      setDownloading(true);
      const filename = `${activeInvoice.invoiceNumber.replace(/\//g, '_')}.docx`;
      await ApiClient.downloadDocx(activeInvoice._id, filename);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  if (!activeInvoice) {
    return (
      <div className="p-12 text-center text-slate-400 glass-panel rounded-2xl">
        <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-200">No Invoices Available</h3>
        <p className="text-sm mt-1">Review a Purchase Order first to generate an invoice draft.</p>
      </div>
    );
  }

  const isIssued = activeInvoice.status === 'ISSUED';
  const isApproved = activeInvoice.status === 'APPROVED';

  return (
    <div className="space-y-6">
      {/* Top Selector / Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel">
        <div className="flex items-center gap-3">
          <select
            value={activeInvoice._id}
            onChange={(e) => setActiveInvoiceId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm font-semibold text-white focus:outline-none"
          >
            {invoices.map((inv) => (
              <option key={inv._id} value={inv._id}>
                {inv.invoiceNumber} - ₹{parseFloat(inv.grandTotal).toLocaleString('en-IN')} ({inv.status})
              </option>
            ))}
          </select>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border ${
              isIssued
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : isApproved
                ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            {activeInvoice.status}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Download DOCX */}
          <button
            onClick={handleDownloadDocx}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>{downloading ? 'Rendering...' : 'Download DOCX'}</span>
          </button>

          {/* Approve Draft */}
          {!isApproved && !isIssued && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>{approving ? 'Approving...' : 'Approve Draft'}</span>
            </button>
          )}

          {/* Issue Official Invoice */}
          {!isIssued && (
            <button
              onClick={handleIssue}
              disabled={issuing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{issuing ? 'Allocating Sequence...' : 'Issue Invoice'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Invoice Document Preview / Form */}
      <div className="p-8 rounded-2xl glass-panel space-y-6">
        {/* Invoice Header Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer Consignee</span>
            <div className="font-bold text-sm text-white mt-1">{activeInvoice.customerId?.name || 'Global Impex Private Limited'}</div>
            <div className="text-xs text-slate-400">GSTIN: {activeInvoice.customerId?.gstin || '29ABCDE1234F1Z8'}</div>
            <div className="text-xs text-slate-400">State: Karnataka (29)</div>
          </div>

          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Numbers</span>
            <div className="font-bold text-sm text-teal-400 mt-1">{activeInvoice.invoiceNumber}</div>
            <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              <span>Date: {activeInvoice.invoiceDate}</span>
            </div>
            <div className="text-xs text-slate-400">
              Tax Regime: {activeInvoice.isInterState ? 'Inter-state IGST (18%)' : 'Intra-state CGST + SGST (18%)'}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dispatch / Logistics</span>
            <div className="grid grid-cols-2 gap-2">
              <input
                disabled={isIssued}
                type="text"
                placeholder="Vehicle No (e.g. KA-01-AB-1234)"
                defaultValue={activeInvoice.vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              />
              <input
                disabled={isIssued}
                type="text"
                placeholder="LR No / E-Way"
                defaultValue={activeInvoice.lrNumber}
                onChange={(e) => setLrNumber(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
              />
            </div>
            {!isIssued && (
              <button
                onClick={handleSaveHeaderDetails}
                disabled={saving}
                className="w-full py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
              >
                Save Logistics
              </button>
            )}
          </div>
        </div>

        {/* Line Items Table with Dispatched Qty Controls */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Commercial Description (Stone Spec)</th>
                <th className="py-3 px-4">HSN</th>
                <th className="py-3 px-4 text-right">PO Qty</th>
                <th className="py-3 px-4 text-right">Dispatched Qty</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">Rate (₹)</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {activeInvoice.items.map((it: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-900/40">
                  <td className="py-3 px-4 text-slate-500 font-bold">{it.itemNumber}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white font-mono text-[11px]">{it.description}</div>
                    {it.patternBreakdown && (
                      <div className="text-[10px] text-teal-400 font-mono mt-0.5">{it.patternBreakdown}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{it.hsnCode}</td>
                  <td className="py-3 px-4 text-right font-medium text-slate-300">{it.orderedQuantity}</td>
                  <td className="py-3 px-4 text-right">
                    {isIssued ? (
                      <span className="font-bold text-teal-300">{it.dispatchedQuantity}</span>
                    ) : (
                      <input
                        type="text"
                        defaultValue={it.dispatchedQuantity}
                        onBlur={(e) => handleUpdateDispatch(idx, e.target.value)}
                        className="w-20 px-2 py-1 text-right rounded bg-slate-900 border border-slate-700 text-teal-300 font-bold focus:border-teal-500"
                      />
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{it.unit}</td>
                  <td className="py-3 px-4 text-right text-slate-200">₹{it.rate}</td>
                  <td className="py-3 px-4 text-right font-bold text-white">₹{it.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invoice Financial Calculation Summary */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-4 border-t border-slate-800">
          <div className="space-y-2 max-w-md">
            <div className="text-xs font-semibold text-slate-300">Amount Chargeable in Words:</div>
            <div className="text-xs italic text-teal-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              {activeInvoice.grandTotalWords}
            </div>
            <div className="text-[11px] text-slate-500">
              Total Crates: <strong>{activeInvoice.totalCrates} CRT</strong> | Bank: State Bank of India
            </div>
          </div>

          <div className="w-full sm:w-72 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal:</span>
              <span className="font-medium text-white">₹{activeInvoice.subtotal}</span>
            </div>

            {activeInvoice.isInterState ? (
              <div className="flex justify-between text-slate-400">
                <span>Integrated GST (18%):</span>
                <span className="font-medium text-white">₹{activeInvoice.igstAmount}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-400">
                  <span>Central GST (9%):</span>
                  <span className="font-medium text-white">₹{activeInvoice.cgstAmount}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>State GST (9%):</span>
                  <span className="font-medium text-white">₹{activeInvoice.sgstAmount}</span>
                </div>
              </>
            )}

            <div className="flex justify-between text-slate-400">
              <span>Round Off:</span>
              <span className="font-medium text-slate-300">₹{activeInvoice.roundOff}</span>
            </div>

            <div className="h-px bg-slate-800 my-1"></div>

            <div className="flex justify-between text-sm font-extrabold text-teal-400 pt-1">
              <span>Invoice Grand Total:</span>
              <span>₹{parseFloat(activeInvoice.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
