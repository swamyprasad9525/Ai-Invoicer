# InvoiceAI: Architecture Decision Records (ADRs)

**Document Reference:** Architecture Decisions & Corrections Log  
**Phase:** Phase 0 (Architecture Review & Baseline Corrections)  

---

## ADR-001: Statutory Place-of-Supply Engine over Simple Shipping-State Comparison

### Context
In Indian B2B invoicing, GST cannot be computed simply by checking if `customer.shippingAddress.stateCode == tenant.address.stateCode` or assuming a flat 18% rate. Tax determination is legally governed by Section 10 of the IGST Act, covering goods movement, bill-to vs ship-to arrangements (third-party billing), SEZ zero-rating, and item-specific HSN tariff schedules.

### Decision
1. Implement a dedicated `PlaceOfSupplyEngine` that receives Seller profile, Buyer legal profile, Consignee shipping site, and optional Third-Party Billing instructions.
2. Determine Place of Supply (POS) state code according to statutory rules.
3. Decouple tax rates from application constants: tax rates are resolved per item via the applicable HSN code (e.g. `6802` standard slabs @ 18%, rough stone blocks @ 5% or 12%).
4. Compute Intra-State (CGST + SGST) vs Inter-State (IGST) dynamically based on the verified POS state vs supplier state.

### Consequences
* Eliminates legal non-compliance and tax audit penalties for pilot businesses.
* Supports complex multi-party logistics (e.g., global trader billing from Bengaluru shipping to a project site in Hyderabad).

---

## ADR-002: Defense-in-Depth Multi-Tenant Isolation Across 6 Layers

### Context
Relying solely on an ORM/ODM query hook or middleware (such as a basic Mongoose tenant filter) is a major architectural liability. If a raw query, background worker, or direct S3 URL bypasses the hook, cross-tenant data exposure occurs.

### Decision
Enforce multi-tenant boundaries across 6 explicit layers:
1. **JWT & Session Layer:** Mandatory `tenantId` in verified claims.
2. **API Authorization Layer:** Route guards verifying caller membership in the target tenant.
3. **Service Layer:** Explicit assertions (`assertTenantOwnership(entity, tenantId)`).
4. **Data Access Layer:** Query filters requiring `{ _id, tenantId }` and compound unique indexes.
5. **Worker Queue:** BullMQ job payloads must contain and validate `tenantId`.
6. **Object Storage:** Object keys namespaced under `tenants/{tenantId}/...` with temporary HMAC-signed URLs.

### Consequences
* Zero cross-tenant data leakage even during background processing or file downloads.
* Full audit compliance for enterprise customers.

---

## ADR-003: Internal Draft Identifiers and Concurrency-Safe Issuance Numbering

### Context
Allocating an official invoice number (e.g., `INV/2026-27/0001`) during the draft stage causes sequence gaps if drafts are cancelled or deleted, violating Indian tax regulations requiring unbroken sequential numbering per financial year.

### Decision
1. Draft invoices strictly use internal identifiers (e.g., `draft_inv_...` or UUIDs).
2. The official, legal invoice number is allocated **only** during the atomic transition to `ISSUED`.
3. The number generation uses an atomic `findOneAndUpdate` with `$inc` on the tenant's series sequence counter within the active financial year.

### Consequences
* Guaranteed gapless, unbroken invoice numbering.
* Concurrency-safe under simultaneous issuance requests.

---

## ADR-004: Invalidation of Approval on Financial Mutation

### Context
If an Owner/Admin approves a draft invoice, subsequent changes by accounts or dispatch staff could silently alter quantities, rates, or taxes without re-approval, compromising financial governance.

### Decision
Implement an immutable approval gate:
* If an invoice is in `APPROVED` status, any modification to line items, quantities, rates, discounts, consignee details, or taxes immediately reverts status to `NEEDS_REVIEW`.
* `approvedBy` and `approvedAt` fields are cleared.
* An audit event `APPROVAL_REVOKED_BY_MUTATION` is recorded with diff snapshots.

### Consequences
* Guarantees that issued invoices strictly reflect authorized figures.

---

## ADR-005: Triple-Layer AI Extraction Model

### Context
LLMs can occasionally hallucinate, misinterpret abbreviations, or miscalculate table rows. Treating an LLM extraction as self-validating proof of correctness is unacceptable in billing software.

### Decision
Every extracted field preserves three layers:
1. `rawValue`: Exact verbatim string from the document text.
2. `normalizedValue`: Structured, typed entity parsed against the schema.
3. `sourceReference`: Source page, bounding box coordinates, and context snippet.

Confidence scores are displayed as review cues only, never as proof of correctness.

### Consequences
* Full transparency during human-in-the-loop review.
* Users can click any extracted field to highlight its exact source location on the original document.

---

## ADR-006: Cumulative Quantity Reconciliation for Partial Shipments

### Context
A purchase order is an order intent, not proof of dispatch. In stone quarrying and export, an order for 240 SQM may be dispatched in multiple partial shipments across several trucks or export containers.

### Decision
1. Multiple invoices can be generated from the same purchase order (`purchaseOrderId`).
2. Every invoice item links directly to its parent `sourcePOItemId`.
3. The system computes:
   $$\text{RemainingBalance} = \text{OrderedQty} - \sum \text{PreviouslyInvoicedQty}$$
4. Dispatches exceeding the remaining balance trigger an `OVER_DISPATCH_WARNING` requiring explicit supervisor override.

### Consequences
* Complete audit reconciliation between customer PO commitments and actual shipments.
* Seamless support for multi-part deliveries.

---

## ADR-007: Explicit Finish Rules and Decoupling from Manufacturing Chronology

### Context
Natural stone specifications feature technical finishes (`Natural`, `Half Honed`, `Tumbled`, `Straight Handcut`, `Handcut`, `Sawn`, `Brushed`). In previous naive implementations, field order was assumed from manufacturing steps or left ambiguous.

### Decision
1. The description intelligence engine maintains explicit, separate mappings for all stone finishes.
2. Field ordering is an explicit, versioned configuration in the business rule profile (`fieldOrder: ["stone", "pattern", "size", "thickness", "topFinish", "edgeFinish", "finalFinish", "crateCount"]`), independent of factory process order.
3. Unrecognized terminology triggers `unknownTermPolicy: "review_required"`.

### Consequences
* 100% reproducible commercial descriptions matching company expectations.
* No silent invention of abbreviations.

---

## ADR-008: DOCX Template Preservation & Isolated PDF Rendering

### Context
Businesses invest heavily in their branded invoice layouts. Re-creating templates from scratch using HTML-to-PDF often fails to capture the exact layout of existing company Word documents.

### Decision
1. Suppliers upload structurally sound DOCX invoice templates with placeholder tags (`{companyName}`, `{#items}...{/items}`, `{grandTotal}`).
2. `docxtemplater` + `pizzip` performs native XML replacement, preserving headers, footers, table borders, and fonts.
3. PDF generation is delegated to an isolated conversion worker.
4. Automated tests verify placeholder completeness and table row repetition. We maintain realistic expectations: layout fidelity is preserved from the original DOCX, avoiding false claims of identical pixel-perfection across differing operating system font engines.

### Consequences
* Clients receive familiar, perfectly editable Word documents alongside printable PDFs.
