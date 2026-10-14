import React from 'react';
import { History, ShieldCheck, Clock, User } from 'lucide-react';

interface AuditLogsViewProps {
  logs: any[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel">
        <div>
          <div className="flex items-center gap-2 text-teal-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <History className="w-4 h-4" />
            <span>Traceability & Compliance (M08)</span>
          </div>
          <h2 className="text-xl font-bold text-white">Immutable System Audit Trail</h2>
          <p className="text-xs text-slate-400 mt-1">
            Complete cryptographic audit trail of all PO uploads, field corrections, rule updates, approvals, and invoice issuances.
          </p>
        </div>
      </div>

      <div className="p-6 rounded-2xl glass-panel">
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              No audit records recorded yet.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log._id}
                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900 transition-all"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200 flex items-center gap-2">
                      <span className="font-mono text-teal-400 font-bold">{log.action}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 text-[11px]">{log.entityType}</span>
                    </div>
                    <div className="text-slate-300 text-[11px] mt-0.5">{log.description}</div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 shrink-0 flex sm:flex-col items-center sm:items-end justify-between">
                  <div className="text-slate-400 flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-500" />
                    <span>{log.actorEmail}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
