# InvoiceAI: Product Requirements Document (PRD)

**Version:** 1.1 (Phase 0 Architectural Corrections Applied)  
**Target Milestone:** MVP Release & Private Pilot  
**Primary Pilot Business:** Swamy Slabs Industries  
**Architecture Classification:** Multi-Tenant B2B SaaS  

---

## 1. Executive Summary & Problem Definition

In B2B industrial manufacturing and exporting (such as natural stone, fabrication, and building materials), suppliers receive customer Purchase Orders (POs) in diverse, unstructured formats (scanned PDFs, emailed tables, customer-specific layouts). 

Creating a compliant sales invoice currently requires manual transcription, tedious terminology conversion (e.g., customer writes *"T. Yellow Tiles 60x40 cm 2 cm Half Honed Tumbled"* while the supplier's commercial invoice must read *"T.YELLOW, TILES, 60X40, 2 CM, H/H, T/B, H/C, BRUSHED, 5CRT"*), error-prone tax calculation, and manual entry into company Microsoft Word templates.

**InvoiceAI** automates this workflow:
1. Intake customer PO documents.
2. Extract structured entities with source references using schema-constrained AI.
3. Apply deterministic, versioned terminology rules.
4. Support partial shipment reconciliation.
5. Apply legally compliant Indian GST Place-of-Supply rules.
6. Generate identical, editable DOCX and printable PDF invoices using the business's approved template.

---

## 2. Core Architectural & Business Rules (Non-Negotiable)

1. **Separation of Perception and Decision:** AI extracts raw document information; application code deterministically governs financial math, tax determination, invoice numbering, permissions, and issuance.
2. **Multi-Tenant Security in Depth:** Every tenant's data is isolated across authentication, authorization, service logic, database operations, background workers, and private object storage.
3. **No Unverified Data:** Never guess missing financial values, dimensions, tax rates, or customer information. Unknown or ambiguous values trigger human review.
4. **Draft vs Issued Separation:** Draft invoices use internal identifiers (`draft_inv_...`). Official legal invoice numbers are sequentially allocated only upon formal issuance.
5. **Approval Invalidation:** Editing any financial or line item data on an approved invoice immediately revokes approval and returns the invoice to review.
6. **Triple-Entity AI Extraction:** For every field, preserve `rawValue`, `normalizedValue`, and `sourceReference` (page and snippet/coordinates).
7. **Multiple Partial Shipments:** A single PO can be invoiced across multiple legitimate shipments. The system tracks cumulative quantities and remaining balances.
8. **Approved Description Intelligence:** Field sequence and abbreviations are governed by explicit, versioned business rules, not physical manufacturing order.

---

## 3. User Personas & Permissions (RBAC)

| Role | Primary Responsibilities | Tenant-Level Permissions |
| :--- | :--- | :--- |
| **Owner / Admin** | Configure company profile, GSTIN, bank details, upload DOCX templates, approve description rules, approve & issue invoices | Full tenant management, template & rule approval, invoice approval & issuance |
| **Accounts Executive** | Upload customer POs, review AI extraction, correct line items, prepare draft invoices, verify Place of Supply | Ingest POs, edit drafts, trigger financial validation |
| **Dispatch Staff** | Input actual dispatched quantities, verify crate counts, input vehicle & LR numbers | Update dispatch quantities and logistics fields on draft invoices |
| **SaaS Operator** | Platform health, tenant onboarding, system metrics | Platform-level monitoring only; **zero routine access** to tenant customer documents |

---

## 4. End-to-End Workflow & Document State Machine

### Document States
* **PO Lifecycle:** `UPLOADED` $\to$ `EXTRACTING` $\to$ `EXTRACTED` $\to$ `DRAFT` $\to$ `NEEDS_REVIEW` $\to$ `APPROVED` $\to$ `ISSUED` (Failures transition to `EXTRACTION_FAILED`).
* **Invoice Lifecycle:** `DRAFT` $\to$ `NEEDS_REVIEW` $\to$ `APPROVED` $\to$ `ISSUED` / `CANCELLED`.

```
[PO PDF Uploaded]
       │
       ▼
 [Hash Check & S3 Ingest] ──(Duplicate detected)──► [Warning Alert with Override Option]
       │
       ▼
 [BullMQ Extraction Worker] ──(Failure)──► [EXTRACTION_FAILED (Manual Retry)]
       │
       ▼
 [EXTRACTED: Raw + Normalized + Source References]
       │
       ▼
 [Description Rule Engine Applied] ──(Unknown Term)──► [Flagged: NEEDS_REVIEW]
       │
       ▼
 [Dispatch Quantity Confirmation] ──(Ordered != Dispatched)──► [Partial Shipment Tracked]
       │
       ▼
 [Place of Supply & GST Engine] (HSN-specific rates + Bill-to/Ship-to evaluation)
       │
       ▼
 [Draft Created (Internal ID)]
       │
       ▼
 [Authorized Approval] ◄──(Financial Data Edited)── [Approval Revoked / Invalidation]
       │
       ▼
 [Formal Issuance] ──► [Atomic Sequential Number Allocated] ──► [Immutable Snapshot Frozen]
       │
       ▼
 [DOCX & PDF Render Worker] ──► [Pre-signed Private Download URLs]
```

---

## 5. Functional Scope: Core Modules (M01 – M10)

### M01: Tenant & Identity Management (P0)
* Multi-tenant organization registration (GSTIN, legal name, trade name, addresses, bank accounts).
* User management with JWT sessions, password hashing (`bcrypt`), and RBAC roles.
* Deep tenant scoping across all layers.

### M02: Customer Directory (P0)
* Buyer masters with legal business name, billing address, multiple delivery/shipping sites, and GSTIN.
* Place-of-Supply defaults and credit payment terms.

### M03: Document Ingestion & Deduplication (P0)
* Multipart streaming upload to private S3-compatible storage.
* SHA-256 document hashing. If a hash matches an existing PO within the tenant, warn the user and show existing PO linkage, with authorized override for repeat orders.
* BullMQ job dispatch for asynchronous extraction.

### M04: AI Extraction Engine (P0)
* Multimodal PDF parsing preserving raw text, normalized structure, and source coordinates.
* Schema enforcement: PO number, PO date, buyer name, currency, line items, crate counts, dimensions, units, rates, totals.
* Missing fields marked `null` with explicit review flags (e.g. `MISSING_THICKNESS`).

### M05: Description Intelligence Engine (P0)
* Two configuration layers:
  1. *Field Layout Sequence:* Explicit, configurable order (e.g., `STONE -> PATTERN -> SIZE -> THICKNESS -> TOP_FINISH -> EDGE_FINISH -> FINAL_FINISH -> CRATES`).
  2. *Versioned Alias Dictionary:* Explicit mappings for finishes (`Half Honed` $\to$ `H/H`, `Tumbled` $\to$ `T/B`, `Handcut` $\to$ `H/C`, `Straight Handcut` $\to$ `H/C`, `Brushed` $\to$ `BRUSHED`, `Natural` $\to$ `NATURAL`, `Sawn` $\to$ `SAWN`).
* Unknown Term Policy: Any finish or term not in the dictionary triggers `review_required` and prohibits silent invention.

### M06: Financial & Place-of-Supply Tax Engine (P0)
* High-precision decimal arithmetic using `Decimal.js`.
* Partial Shipment Reconciliation:
  $$DispatchedNow \le OrderedQty - PreviouslyInvoicedQty$$
* Legally compliant Indian GST Place-of-Supply evaluation:
  - Evaluation of Supplier State vs Delivery State vs Bill-To State under Section 10 of IGST Act.
  - Per-item HSN tax rate slabs (not hardcoded to 18%).
  - Tax calculation: CGST + SGST (Intra-state) vs IGST (Inter-state).

### M07: DOCX & PDF Template Generation (P0)
* Preservation of company DOCX templates via `docxtemplater` with dynamic loop tables (`{#items}...{/items}`).
* Isolated PDF conversion worker.
* Automated layout check verifying table loops, field population, and missing tags.

### M08: Approval Lifecycle & Sequential Numbering (P0)
* Concurrency-safe atomic invoice sequence generation scoped to `[tenantId, financialYear, series]`.
* Strict issuance locking: once issued, the invoice snapshot is permanently immutable.
* Approval invalidation on financial mutation.

### M09: Dashboard & Activity Reporting (P1)
* PO-to-invoice status pipeline, pending approvals, discrepancy warnings, and monthly billing metrics.

### M10: Subscription & Usage Metering (P1 - Post-MVP)
* Document quotas and usage metering.

---

## 6. Pilot Reference Test Case: Swamy Slabs Industries

* **Tenant:** Swamy Slabs Industries, Tandur, Telangana (State Code `36`, GSTIN: `36AAAAA1234A1Z5`).
* **Customer:** Global Impex Private Limited, Bengaluru, Karnataka (State Code `29`, GSTIN: `29ABCDE1234F1Z8`).
* **Place of Supply:** Karnataka (`29`) $\implies$ Interstate IGST applicable.
* **Benchmark PO:** `POM14356A` dated 09 Sep 2026.
* **5 Target Line Items:**
  1. `T. Yellow Palisade, 100×50 cm, 3-5 cm`: 33.00 SQM @ ₹1,150 = ₹37,950 | 3 Crates
  2. `T. Yellow Palisade, 150×50 cm, 3-5 cm`: 40.50 SQM @ ₹1,300 = ₹52,650 | 3 Crates
  3. `T. Yellow Tiles, 100×50 cm, 3 cm`: 22.00 SQM @ ₹1,080 = ₹23,760 | 2 Crates
  4. `T. Yellow Tiles, 60×40 cm, 2 cm`: 100.80 SQM @ ₹550 = ₹55,440 | 5 Crates
  5. `T. Yellow French Opus, 3 cm`: 43.20 SQM @ ₹650 = ₹28,080 | 3 Crates
  * **Goods Subtotal:** ₹1,97,880.00 | **Total Crates:** 16 | **Total Area:** 239.50 SQM.
* **Approved Commercial Description Format:**
  `T.YELLOW, FRENCH OPUS, MODULAR SET, 3 CM, H/H, CALIBRATED, H/C, T/B, BRUSHED, 3CRT`  
  `Pattern: 20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC`
