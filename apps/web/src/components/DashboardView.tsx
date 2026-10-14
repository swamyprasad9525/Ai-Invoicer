import React from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Upload,
  Receipt,
  Sparkles
} from 'lucide-react';

interface DashboardViewProps {
  pos: any[];
  invoices: any[];
  onNavigate: (view: string, id?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ pos, invoices, onNavigate }) => {
  const pendingReviewCount = pos.filter((p) => p.status === 'EXTRACTED' || p.status === 'NEEDS_REVIEW').length;
  const draftInvoicesCount = invoices.filter((i) => i.status === 'DRAFT').length;
  const issuedInvoicesCount = invoices.filter((i) => i.status === 'ISSUED').length;

  const totalInvoicedValue = invoices
    .filter((i) => i.status === 'ISSUED')
    .reduce((sum, inv) => sum + parseFloat(inv.grandTotal || '0'), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 border border-teal-500/20 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pilot Workflow Active</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Purchase Order to Invoice Pipeline</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Upload purchase order PDFs, verify AI extracted stone lines against company description rules, reconcile dispatched quantities, and generate compliant DOCX invoices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('upload')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-teal-500/25"
          >
            <Upload className="w-4 h-4" />
            <span>Upload PO</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total POs Uploaded</span>
            <FileText className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">{pos.length}</div>
          <div className="text-xs text-slate-400 mt-1">Extracted from customer documents</div>
        </div>

        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-300">{pendingReviewCount}</div>
          <div className="text-xs text-amber-400/80 mt-1">Requires quantity / term check</div>
        </div>

        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Invoice Drafts</span>
            <Receipt className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-extrabold text-sky-300">{draftInvoicesCount}</div>
          <div className="text-xs text-slate-400 mt-1">Calculated with GST & dispatch</div>
        </div>

        <div className="p-5 rounded-2xl glass-card">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Issued Invoices</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-300">{issuedInvoicesCount}</div>
          <div className="text-xs text-slate-400 mt-1">
            Total ₹{totalInvoicedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main Grid: Recent POs & Pipeline Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Recent POs */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-lg text-white">Recent Purchase Orders</h3>
              <p className="text-xs text-slate-400">Extracted customer orders ready for verification</p>
            </div>
            <button
              onClick={() => onNavigate('review')}
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-800/80">
            {pos.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                No purchase orders uploaded yet.
              </div>
            ) : (
              pos.map((po) => (
                <div
                  key={po._id}
                  className="py-3.5 flex items-center justify-between hover:bg-slate-800/30 px-3 rounded-xl transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-teal-400 font-bold text-xs">
                      PO
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        {po.poNumber}
                        <span className="text-xs font-normal text-slate-400">({po.poDate})</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {po.buyerName} • {po.items?.length || 0} line items
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-200">
                        ₹{parseFloat(po.poGoodsTotal || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        {po.status}
                      </span>
                    </div>

                    <button
                      onClick={() => onNavigate('review', po._id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-all"
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Pilot Benchmark Card */}
        <div className="p-6 rounded-2xl glass-panel space-y-4">
          <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pilot Milestone: Swamy Slabs</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-3">
            <div className="text-xs font-semibold text-slate-300">Benchmark PO: POM14356A</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              5 lines of Tandur Yellow Limestone with French Opus, Palisades, and Tiles. Correctly parsed with Indian GST, dispatch checks, and Word export.
            </p>
            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
              <span className="text-slate-400">Order Value:</span>
              <span className="font-bold text-white">₹1,97,880.00</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Dispatched Crates:</span>
              <span className="font-bold text-teal-400">16 Crates</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Actions</div>
            <button
              onClick={() => onNavigate('rules')}
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-all flex items-center justify-between"
            >
              <span>Inspect Description Rules</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button
              onClick={() => onNavigate('invoices')}
              className="w-full text-left px-3.5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-all flex items-center justify-between"
            >
              <span>View Generated Invoices</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
