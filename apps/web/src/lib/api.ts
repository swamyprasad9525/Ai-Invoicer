const API_BASE = '/api';

export interface UserSession {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenant: {
      id: string;
      name: string;
      slug: string;
      gstin: string;
    };
  };
}

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem('invoiceai_token');
  }

  public static setSession(session: UserSession): void {
    localStorage.setItem('invoiceai_token', session.token);
    localStorage.setItem('invoiceai_user', JSON.stringify(session.user));
  }

  public static getSessionUser(): any | null {
    const raw = localStorage.getItem('invoiceai_user');
    return raw ? JSON.parse(raw) : null;
  }

  public static clearSession(): void {
    localStorage.removeItem('invoiceai_token');
    localStorage.removeItem('invoiceai_user');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {})
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    headers['X-Requested-With'] = 'XMLHttpRequest';

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }

    // Handle binary responses (e.g. DOCX download)
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/vnd.openxmlformats-officedocument')) {
      return (await res.blob()) as unknown as T;
    }

    return res.json();
  }

  // Auth
  public static async login(email: string = 'admin@swamyslabs.com', password: string = 'admin123'): Promise<UserSession> {
    const session = await this.request<UserSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setSession(session);
    return session;
  }

  public static async getMe(): Promise<any> {
    return this.request('/auth/me');
  }

  public static async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' }).catch(() => {});
    this.clearSession();
  }

  // Tenant / Workspaces
  public static async getCurrentTenant(): Promise<any> {
    return this.request('/tenants/current');
  }

  public static async updateTenant(data: any): Promise<any> {
    return this.request('/tenants/current', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public static async createTenantWorkspace(data: any): Promise<any> {
    const res = await this.request<any>('/tenants', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token && res.tenant) {
      this.setSession({
        token: res.token,
        user: {
          ...this.getSessionUser(),
          tenant: res.tenant,
          role: res.role
        }
      });
    }
    return res;
  }

  public static async getMyMemberships(): Promise<any[]> {
    return this.request('/tenants/my-memberships');
  }

  public static async switchTenant(tenantId: string): Promise<any> {
    const res = await this.request<any>(`/tenants/switch/${tenantId}`, {
      method: 'POST'
    });
    if (res.token && res.activeTenant) {
      this.setSession({
        token: res.token,
        user: {
          ...this.getSessionUser(),
          tenant: res.activeTenant,
          role: res.role
        }
      });
    }
    return res;
  }

  // Customers
  public static async getCustomers(): Promise<any[]> {
    return this.request('/customers');
  }

  public static async createCustomer(data: any): Promise<any> {
    return this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  public static async updateCustomer(id: string, data: any): Promise<any> {
    return this.request(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  public static async deleteCustomer(id: string): Promise<any> {
    return this.request(`/customers/${id}`, {
      method: 'DELETE'
    });
  }

  // Purchase Orders
  public static async getPurchaseOrders(): Promise<any[]> {
    return this.request('/purchase-orders');
  }

  public static async getPurchaseOrder(id: string): Promise<any> {
    return this.request(`/purchase-orders/${id}`);
  }

  public static async uploadPO(formData: FormData): Promise<any> {
    return this.request('/purchase-orders/upload', {
      method: 'POST',
      body: formData
    });
  }

  public static async updatePO(id: string, updates: any): Promise<any> {
    return this.request(`/purchase-orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  public static async generateInvoiceDraft(poId: string): Promise<any> {
    return this.request(`/purchase-orders/${poId}/generate-draft`, {
      method: 'POST'
    });
  }

  // Description Rules
  public static async getDescriptionRule(): Promise<any> {
    return this.request('/description-rules/current');
  }

  public static async testTransform(item: any, rule?: any): Promise<any> {
    return this.request('/description-rules/test-transform', {
      method: 'POST',
      body: JSON.stringify({ item, rule })
    });
  }

  public static async saveDescriptionRule(rule: any): Promise<any> {
    return this.request('/description-rules', {
      method: 'POST',
      body: JSON.stringify(rule)
    });
  }

  // Invoices
  public static async getInvoices(): Promise<any[]> {
    return this.request('/invoices');
  }

  public static async getInvoice(id: string): Promise<any> {
    return this.request(`/invoices/${id}`);
  }

  public static async updateInvoice(id: string, updates: any): Promise<any> {
    return this.request(`/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  public static async approveInvoice(id: string): Promise<any> {
    return this.request(`/invoices/${id}/approve`, {
      method: 'POST'
    });
  }

  public static async issueInvoice(id: string): Promise<any> {
    return this.request(`/invoices/${id}/issue`, {
      method: 'POST'
    });
  }

  public static async downloadDocx(invoiceId: string, filename: string): Promise<void> {
    const blob = await this.request<Blob>(`/invoices/${invoiceId}/download?format=docx`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  // Audit Logs
  public static async getAuditLogs(): Promise<any[]> {
    return this.request('/audit-logs');
  }
}
