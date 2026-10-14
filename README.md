# InvoiceAI: Enterprise Multi-Tenant PO-to-Invoice SaaS

> A production-grade multi-business SaaS platform that converts customer purchase orders into verified, reviewable commercial invoices while preserving each company's exact terminology and custom invoice design.

---

## 🏛️ System Architecture

InvoiceAI is built upon a fundamental architectural axiom:
> **"AI interprets documents; application code handles financial arithmetic, validation, permissions, numbering, and final issuance."**

```
                  ┌────────────────────────────────────────┐
                  │          Customer Purchase Order       │
                  │              (PDF / Image)             │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       Gemini Multimodal AI Layer       │
                  │   (Schema-Constrained PO Extraction)   │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │    Description Intelligence Engine     │
                  │  (Deterministic Domain Rule Dictionary)│
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       Precision Financial Engine       │
                  │     (Decimal.js + Indian GST Logic)    │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │   Native Mapped DOCX & PDF Templating  │
                  │        (Audit Frozen Snapshots)        │
                  └────────────────────────────────────────┘
```

---

## 📦 Monorepo Workspace Structure

* `packages/shared`: Shared TypeScript types, Zod validation schemas, Decimal money math utilities, and Indian currency words generator.
* `apps/api`: Node.js + Express + TypeScript REST API:
  - Multi-tenant Mongoose models with automatic tenant query isolation.
  - JWT Authentication + RBAC (`OWNER_ADMIN`, `ACCOUNTS_EXECUTIVE`, `DISPATCH_STAFF`).
  - Google Gemini schema-constrained extraction engine with fallback.
  - Description Rule Engine with versioned alias dictionaries.
  - Financial engine with automated intra-state (CGST+SGST) vs inter-state (IGST) tax calculation.
  - Native DOCX Word template generator (`docxtemplater` + `pizzip`).
  - Concurrency-safe atomic sequential invoice number generation.
  - Cryptographic audit trail.
* `apps/web`: React 18 + Vite + Tailwind CSS + Lucide Icons:
  - Executive financial dashboard.
  - Side-by-side purchase order review interface.
  - Live description rule configuration sandbox.
  - Invoice editor with dispatch quantity reconciliation and 1-click DOCX download.

---

## 🚀 Quick Start (Local Run)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(If no `MONGODB_URI` is provided, an embedded in-memory MongoDB server runs automatically!)*

### 3. Run Automated Pilot Test Suite
```bash
npm run test:workflow --workspace=@invoiceai/api
```

### 4. Start Development Servers
In two terminals:
```bash
# Terminal 1: Backend API (Port 5000)
npm run dev:api

# Terminal 2: React Web Frontend (Port 3000)
npm run dev:web
```

Open `http://localhost:3000` in your browser. Default login: `admin@swamyslabs.com` / `admin123`.

---

## 🎯 Swamy Slabs Benchmark Case (`POM14356A`)
* **Purchase Order:** `POM14356A` from **Global Impex Private Limited**
* **Extracted Lines:** 5 complete stone specifications (French Opus, Palisades, Tiles)
* **Goods Total:** ₹1,97,880.00 | **Total Packaging:** 16 Crates
* **Interstate Tax (IGST 18%):** ₹35,618.40
* **Invoice Total:** ₹2,33,498.00
* **Target Output:** `T.YELLOW, FRENCH OPUS, 2 cm, H/H, T/B, H/C, BRUSHED, 24CRT` + modular tile pattern sets.
