import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  FileCheck2,
  Receipt,
  BookOpenCheck,
  Users,
  History
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  pendingReviewCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, pendingReviewCount }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'upload', label: 'Upload PO', icon: UploadCloud },
    { id: 'review', label: 'PO Review', icon: FileCheck2, badge: pendingReviewCount > 0 ? pendingReviewCount : undefined },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'rules', label: 'Description Rules', icon: BookOpenCheck },
    { id: 'customers', label: 'Customer Directory', icon: Users },
    { id: 'audit', label: 'Audit Trail', icon: History }
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between shrink-0">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Billing Pipeline
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/10 text-teal-300 border border-teal-500/30 shadow-sm shadow-teal-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-teal-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-xs text-slate-400">
        <div className="font-semibold text-slate-200 mb-1">Pilot Tenant Active</div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Swamy Slabs Industries configured for Tandur Yellow Limestone & French Opus.
        </p>
      </div>
    </aside>
  );
};
