import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Edit2,
  Save,
  Layers,
  FileCheck,
  Building,
  Loader2
} from 'lucide-react';
import { ApiClient } from '../lib/api';

interface POReviewViewProps {
  po: any;
  onDraftGenerated: (invoice: any) => void;
  onRefreshPO: () => void;
}

export const POReviewView: React.FC<POReviewViewProps> = ({ po, onDraftGenerated, onRefreshPO }) => {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [editing, setEditing] = useState<boolean>(false);
  const [items, setItems] = useState<any[]>(po.items || []);
  const [generating, setGenerating] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const selectedItem = items[selectedItemIndex] || items[0];

  const handleItemFieldChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      await ApiClient.updatePO(po._id, { items });
      setEditing(false);
      onRefreshPO();
    } catch (err: any) {
      alert(`Failed to save changes: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDraft = async () => {
    try {
      setGenerating(true);
      const invoice = await ApiClient.generateInvoiceDraft(po._id);
      onDraftGenerated(invoice);
    } catch (err: any) {
      alert(`Failed to generate draft: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header / Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-1">
            <span>INVOICEAI</span>
            <span>/</span>
            <span className="text-teal-400">Side-by-Side PO Verification</span>
            <span className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 text-[10px] font-bold border border-teal-500/20">
              {po.status}
            </span>
          </div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>PO #{po.poNumber}</span>
            <span className="text-sm font-normal text-slate-400">({po.poDate})</span>
          </h2>
          <div className="text-xs text-slate-300 mt-1 flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-teal-400" />
            <span>Buyer: <strong>{po.buyerName}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {editing ? (
            <button
              onClick={handleSaveChanges}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs shadow-md transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Corrections'}</span>
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Extracted Fields</span>
            </button>
          )}

          <button
            onClick={handleGenerateDraft}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Applying Rules & GST...</span>
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                <span>Review & Approve (Create Draft)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Core Side-by-Side Review Split Panes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Pane: Original Purchase Order Details */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-400" />
              <h3 className="font-bold text-sm text-slate-200">Original Purchase Order Document</h3>
            </div>
            <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
              {po.originalFileName}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs space-y-2">
            <div className="text-slate-400 flex justify-between">
              <span>BUYER: {po.buyerName}</span>
              <span>PO: {po.poNumber}</span>
            </div>
            <div className="text-slate-400">DATE: {po.poDate}</div>
            <div className="h-px bg-slate-800 my-2"></div>

            {/* List of raw PO rows */}
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedItemIndex(idx)}
                  className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    selectedItemIndex === idx
                      ? 'bg-teal-500/15 border border-teal-500/40 text-teal-200'
                      : 'hover:bg-slate-900 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-slate-500 font-bold">{it.line}</span>
                    <span>
                      {it.category || 'Product'} {it.size} ({it.thickness})
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-200">{it.orderedQuantity} {it.unit}</span>
                    <span className="text-slate-400">₹{it.poLineTotal}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-slate-800 my-2"></div>
            <div className="flex justify-between items-center text-sm font-bold text-teal-400 pt-1">
              <span>ORDER GOODS TOTAL</span>
              <span>₹{parseFloat(po.poGoodsTotal || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
            💡 <strong>Document Safeguard:</strong> Model confidence signals are audited; human accounts approval verifies quantities before legal invoice issuance.
          </div>
        </div>

        {/* Right Pane: Extracted Line Item & Rule Engine Preview */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-slate-200">
                Rule-Applied Commercial Specification
              </h3>
            </div>
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-semibold">
              Item #{selectedItem?.line} of {items.length}
            </span>
          </div>

          {selectedItem && (
            <div className="space-y-4">
              {/* Commercial Description Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-teal-950/30 to-slate-900 border border-teal-500/30 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved Description Generated</span>
                </div>
                <div className="text-base font-bold text-white font-mono leading-relaxed">
                  T.YELLOW, {selectedItem.category?.toUpperCase()}, {selectedItem.size?.toUpperCase()}, {selectedItem.thickness?.toUpperCase()}, {(selectedItem.topFinish || []).join(', ').toUpperCase() || 'NATURAL'}, {selectedItem.crateCount}CRT
                </div>
                {selectedItem.patternBreakdown && (
                  <div className="text-xs font-mono text-teal-300 pt-1 border-t border-teal-500/20">
                    Pattern: {selectedItem.patternBreakdown}
                  </div>
                )}
              </div>

              {/* Editable Fields Breakdown */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-slate-400 block mb-1">Stone / Material</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.material || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'material', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Product Category</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.category || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'category', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Dimensions / Size</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.size || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'size', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Thickness</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.thickness || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'thickness', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Ordered Quantity ({selectedItem.unit})</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.orderedQuantity || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'orderedQuantity', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold disabled:opacity-75"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Unit Rate (₹ / {selectedItem.unit})</label>
                  <input
                    disabled={!editing}
                    type="text"
                    value={selectedItem.rate || ''}
                    onChange={(e) => handleItemFieldChange(selectedItemIndex, 'rate', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold disabled:opacity-75"
                  />
                </div>
              </div>

              {/* Review Guidance Box */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Review Requirement</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  Ordered quantity is not proof of dispatch. On the next screen, dispatch staff can confirm exact loaded quantities before issuing the tax invoice.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
