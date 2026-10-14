import React, { useState } from 'react';
import { Building2, ShieldCheck, UserCircle, Activity, ChevronDown, LogOut, Plus } from 'lucide-react';

interface NavbarProps {
  tenantName: string;
  userRole: string;
  userName: string;
  memberships?: any[];
  onSwitchTenant?: (tenantId: string) => void;
  onLogout?: () => void;
  onOpenCreateWorkspace?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  tenantName,
  userRole,
  userName,
  memberships = [],
  onSwitchTenant,
  onLogout,
  onOpenCreateWorkspace
}) => {
  const [showTenantMenu, setShowTenantMenu] = useState(false);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <span className="font-extrabold text-white text-lg tracking-tighter">IA</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-white leading-tight flex items-center gap-2">
              InvoiceAI
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Chunk 1
              </span>
            </h1>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-800 hidden sm:block"></div>

        {/* Active Tenant Badge with Dropdown Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowTenantMenu(!showTenantMenu)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors"
          >
            <Building2 className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-medium text-slate-200">{tenantName || 'Swamy Slabs Industries'}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showTenantMenu && (
            <div className="absolute left-0 top-full mt-2 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-2 z-50 text-xs">
              <div className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400">
                Company Workspaces
              </div>
              {memberships.map((m: any) => {
                const t = m.tenantId;
                if (!t) return null;
                const isCurrent = t.name === tenantName;
                return (
                  <button
                    key={t._id}
                    onClick={() => {
                      setShowTenantMenu(false);
                      if (onSwitchTenant) onSwitchTenant(t._id);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800 ${
                      isCurrent ? 'bg-teal-500/10 text-teal-300 font-bold' : 'text-slate-300'
                    }`}
                  >
                    <div>
                      <div>{t.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.gstin}</div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">({m.role})</span>
                  </button>
                );
              })}

              <div className="h-px bg-slate-800 my-1"></div>

              {onOpenCreateWorkspace && (
                <button
                  onClick={() => {
                    setShowTenantMenu(false);
                    onOpenCreateWorkspace();
                  }}
                  className="w-full text-left px-3 py-2 text-teal-400 font-semibold hover:bg-slate-800 flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Workspace</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* System Status */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-800">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span>Tenant Isolated (6 Layers)</span>
        </div>

        {/* User Role Badge & Logout */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{userName || 'Swamy Admin'}</div>
            <div className="text-[10px] font-medium text-teal-400 flex items-center justify-end gap-1">
              <ShieldCheck className="w-3 h-3" />
              {userRole || 'OWNER_ADMIN'}
            </div>
          </div>

          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <UserCircle className="w-5 h-5 text-teal-400" />
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
