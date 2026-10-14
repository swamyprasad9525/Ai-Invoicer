import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { POUploadView } from './components/POUploadView';
import { POReviewView } from './components/POReviewView';
import { InvoiceEditorView } from './components/InvoiceEditorView';
import { DescriptionRuleView } from './components/DescriptionRuleView';
import { CustomerListView } from './components/CustomerListView';
import { AuditLogsView } from './components/AuditLogsView';
import { ApiClient } from './lib/api';
import { Loader2 } from 'lucide-react';

export function App() {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [tenant, setTenant] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [rule, setRule] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Initial Bootstrap & Auto-Login as Pilot Admin
  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Auto login to Swamy Slabs admin if not authenticated
      let currentUser = ApiClient.getSessionUser();
      if (!currentUser) {
        const session = await ApiClient.login('admin@swamyslabs.com', 'admin123');
        currentUser = session.user;
      }
      setUser(currentUser);

      // Fetch all core domain records
      const [tenantData, customerData, poData, invoiceData, ruleData, logsData] = await Promise.all([
        ApiClient.getCurrentTenant().catch(() => null),
        ApiClient.getCustomers().catch(() => []),
        ApiClient.getPurchaseOrders().catch(() => []),
        ApiClient.getInvoices().catch(() => []),
        ApiClient.getDescriptionRule().catch(() => null),
        ApiClient.getAuditLogs().catch(() => [])
      ]);

      setTenant(tenantData);
      setCustomers(customerData);
      setPos(poData);
      setInvoices(invoiceData);
      setRule(ruleData);
      setAuditLogs(logsData);

      if (poData.length > 0 && !selectedPOId) {
        setSelectedPOId(poData[0]._id);
      }
    } catch (err: any) {
      console.error('Initialization error:', err);
      setError(err.message || 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleNavigate = (view: string, id?: string) => {
    if (view === 'review' && id) {
      setSelectedPOId(id);
    } else if (view === 'invoices' && id) {
      setSelectedInvoiceId(id);
    }
    setCurrentView(view);
  };

  const handleUploadSuccess = (newPO: any) => {
    setPos([newPO, ...pos]);
    setSelectedPOId(newPO._id);
    setCurrentView('review');
  };

  const handleDraftGenerated = (newInvoice: any) => {
    setInvoices([newInvoice, ...invoices]);
    setSelectedInvoiceId(newInvoice._id);
    setCurrentView('invoices');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <div className="text-center">
          <div className="font-bold text-white text-base">InvoiceAI Enterprise Monolith</div>
          <div className="text-xs text-slate-500 mt-1">Bootstrapping Swamy Slabs Pilot Environment...</div>
        </div>
      </div>
    );
  }

  const selectedPO = pos.find((p) => p._id === selectedPOId) || pos[0];
  const pendingReviewCount = pos.filter((p) => p.status === 'EXTRACTED' || p.status === 'NEEDS_REVIEW').length;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Navbar
        tenantName={tenant?.name || 'Swamy Slabs Industries'}
        userRole={user?.role || 'OWNER_ADMIN'}
        userName={user?.name || 'Swamy Admin'}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          pendingReviewCount={pendingReviewCount}
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <strong>System Notice:</strong> {error}
            </div>
          )}

          {currentView === 'dashboard' && (
            <DashboardView
              pos={pos}
              invoices={invoices}
              onNavigate={handleNavigate}
            />
          )}

          {currentView === 'upload' && (
            <POUploadView
              customers={customers}
              onUploadSuccess={handleUploadSuccess}
            />
          )}

          {currentView === 'review' && (
            selectedPO ? (
              <POReviewView
                po={selectedPO}
                onDraftGenerated={handleDraftGenerated}
                onRefreshPO={loadInitialData}
              />
            ) : (
              <div className="text-center py-12 text-slate-400">
                No purchase orders available. Upload one to review.
              </div>
            )
          )}

          {currentView === 'invoices' && (
            <InvoiceEditorView
              invoices={invoices}
              selectedInvoiceId={selectedInvoiceId || undefined}
              onRefresh={loadInitialData}
            />
          )}

          {currentView === 'rules' && (
            <DescriptionRuleView
              rule={rule}
              onRefresh={loadInitialData}
            />
          )}

          {currentView === 'customers' && (
            <CustomerListView customers={customers} />
          )}

          {currentView === 'audit' && (
            <AuditLogsView logs={auditLogs} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
