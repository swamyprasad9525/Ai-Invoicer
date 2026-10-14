# InvoiceAI: Technical System Architecture

**Document Version:** 1.1 (Phase 0 Architectural Corrections Applied)  
**Classification:** Modular Monorepo Architecture Blueprint  

---

## 1. Monorepo Structure & System Topology

```
+---------------------------------------------------------------------------------------+
|                                    INVOICEAI PLATFORM                                 |
+---------------------------------------------------------------------------------------+
| apps/web                  apps/api                          packages/shared           |
| (React 18 + Vite +        (Express + TypeScript +           (Domain Types, Zod Schemas|
|  Tailwind CSS)             BullMQ Worker + Services)         Decimal.js Math & Utils) |
+---------------------------------------------------------------------------------------+
       │                             │                                 │
       ▼                             ▼                                 ▼
 [Browser Client]           [REST API & Workers]              [Shared Contracts]
       │                             │
       │ (JSON via HTTPS)            ├──────────────► [Redis 7 + BullMQ] (Async Pipeline)
       │                             ├──────────────► [MongoDB 6+] (Tenant Isolated Data)
       │                             ├──────────────► [Private S3 Storage] (Signed URLs)
       │                             ├──────────────► [Gemini Vision LLM] (Schema Parser)
       │                             └──────────────► [Isolated PDF Conversion Worker]
```

---

## 2. Multi-Tenant Security in Depth (6 Defensive Layers)

Relying solely on a database ORM plugin for multi-tenancy is dangerous and insufficient. InvoiceAI enforces **Defense in Depth** across 6 distinct architectural boundaries:

```
[Layer 1: JWT Session] ──► [Layer 2: RBAC Guard] ──► [Layer 3: Service Assertion]
                                                             │
                                                             ▼
[Layer 6: S3 Bucket Prefix] ◄── [Layer 5: Queue Scoping] ◄── [Layer 4: DB Compound Index]
```

1. **Authentication & Session Layer:**
   - Every authenticated JWT explicitly carries `tenantId`, `userId`, `role`, and assigned `permissions`.
   - On every request, the session validates that the tenant exists, is in `ACTIVE` status, and the user membership is valid.
2. **API & Route Authorization Layer:**
   - `requireAuth` extracts `req.tenantId` and `req.user`.
   - `requireRole([...])` validates that the caller possesses the necessary role in the specific tenant organization.
3. **Service-Level Access Assertions:**
   - Business services execute explicit tenant boundary assertions before executing logic:
     ```typescript
     function assertTenantOwnership(entity: { tenantId: string }, callerTenantId: string) {
       if (entity.tenantId.toString() !== callerTenantId.toString()) {
         throw new ForbiddenError('Tenant boundary violation: Access denied to foreign entity.');
       }
     }
     ```
4. **Data Access Layer & Compound Indexing:**
   - Every collection enforces `tenantId` in every query predicate (`findOne({ _id, tenantId })`).
   - Unique constraints are always compound: `{ tenantId: 1, invoiceNumber: 1 }`, `{ tenantId: 1, poNumber: 1 }`.
5. **Background Queue & Worker Isolation:**
   - Every BullMQ job payload carries a mandatory `tenantId`.
   - Workers re-authenticate the tenant context before touching databases, files, or LLM endpoints.
6. **Object Storage Isolation & Pre-signed Links:**
   - S3 object keys are strictly namespaced: `tenants/{tenantId}/pos/{fileHash}.pdf` and `tenants/{tenantId}/invoices/{invoiceId}.docx`.
   - Download URLs are temporary, HMAC-signed pre-signed URLs with a 15-minute expiration time. No bucket is ever public.

---

## 3. Place-of-Supply (POS) & Indian GST Calculation Engine

Under the Indian Goods and Services Tax (GST) Act (principally Section 10 of the Integrated Goods and Services Tax Act, 2017), tax determination cannot be a simple string comparison of shipping addresses, nor can rates be hardcoded.

### Statutory Place of Supply Determination (Goods):
* **Movement of Goods (Sec 10(1)(a)):** Place of supply is the location of the goods at the time at which the movement of goods terminates for delivery to the recipient.
* **Bill-To / Ship-To (Third Party Supply, Sec 10(1)(b)):** Where goods are delivered to a consignee on the direction of a third party, place of supply is deemed to be the principal place of business of such third person.
* **Export / SEZ Supply:** Supplies to an SEZ unit or developer are treated as interstate supplies and are zero-rated.

### Tax Computation Logic:
1. **Determine Place of Supply (POS) State Code:**
   - Evaluated from Buyer Billing State vs Delivery Site State vs Third-party Bill-to instructions.
2. **HSN-Specific Tax Rate Lookup:**
   - Every line item specifies an HSN code (e.g. `6802` for worked monumental/building stone, slabs, tiles).
   - The HSN determines the statutory rate slab (e.g., standard slabs @ 18%, certain blocks/rough stone @ 5% or 12%).
3. **Regime Evaluation:**
   $$\text{If } \text{SupplierStateCode} == \text{POSStateCode} \implies \text{Intra-State: CGST } (R/2) + \text{SGST } (R/2)$$
   $$\text{If } \text{SupplierStateCode} \ne \text{POSStateCode} \implies \text{Inter-State: IGST } (R)$$
4. **Decimal Arithmetic Precision:**
   - Line subtotal: $Amount = (Qty \times Rate) - Discount$.
   - Tax: Computed using `Decimal.js` with `ROUND_HALF_UP` rounding.
   - Grand Total = Subtotal + Total Tax + RoundOff.

---

## 4. Document Lifecycle & Numbering Invariants

### 1. Draft vs Official Invoicing:
* **Draft Stage:** When a draft invoice is generated, it is identified solely by an **internal identifier** (e.g., `draft_inv_01j7...` or `DRAFT-POM14356A`).
* **Official Issuance:** The legal invoice number (e.g., `INV/2026-27/0001`) is allocated **only** at the moment the status transitions to `ISSUED`.
* **Sequential Numbering Invariant:** Sequence generation is atomic and concurrency-safe:
  $$\text{Atomic increment of } nextSequenceNumber \text{ scoped to } [\text{tenantId}, \text{series}, \text{financialYear}]$$

### 2. Approval Invalidation Invariant:
* If an invoice is in `APPROVED` status, any modification to:
  - Line items, quantities, rates, discounts, or HSN codes
  - Buyer consignee details or Place of Supply
  - Freight, packaging charges, or tax overrides
* **Immediately and irrevocably reverts status to `NEEDS_REVIEW`**, wipes `approvedBy` and `approvedAt`, and records an audit event: `APPROVAL_REVOKED_BY_MUTATION`.

### 3. Immutable Frozen Snapshot:
* When an invoice is `ISSUED`:
  - An exact JSON snapshot of tenant profile, buyer profile, line items, taxes, and bank details is saved into `immutableIssuedSnapshot`.
  - Further updates to the invoice record are completely blocked by service guards and schema pre-save hooks.
  - Any subsequent revision requires an explicit Credit Note or Debit Note workflow.

---

## 5. Purchase Order Reconciliation & Partial Shipments

A customer Purchase Order is an order commitment, **not** proof of dispatch. A single PO may be fulfilled through multiple partial shipments over weeks or months.

### Line-Item Quantity Reconciliation Model:
For every PO line item:
$$\text{TotalOrderedQuantity} = \text{CumulativeDispatchedQuantity} + \text{RemainingBalanceQuantity}$$
$$\text{PreviouslyInvoicedQuantity} = \sum_{\text{All Issued Invoices}} \text{dispatchedQuantity}$$
$$\text{MaxAllowableDispatch} = \text{TotalOrderedQuantity} - \text{PreviouslyInvoicedQuantity}$$

* **Validation Rule:** The dispatch staff can invoice any amount up to `MaxAllowableDispatch`.
* **Over-Dispatch Exception:** If `DispatchedNow > MaxAllowableDispatch`, the system flags an over-shipment warning and requires explicit Admin approval before the draft can proceed.
* **Multi-Invoice PO Status:**
  - If $\sum Dispatched < Ordered$: PO status remains `PARTIALLY_INVOICED`.
  - If $\sum Dispatched == Ordered$: PO status transitions to `FULLY_INVOICED`.

---

## 6. AI Extraction Architecture: Triple Entity Model

The extraction pipeline treats PO document text as **untrusted data** and never assumes LLM output is inherently correct.

Every extracted line item must store three layers:
1. `rawValue`: Exact verbatim string from the document text (e.g., `"T. Yellow French Opus 3 cm, H/H, T/B, H/C"`).
2. `normalizedValue`: Canonical parsed entity object:
   ```json
   {
     "material": "Tandur Yellow Limestone",
     "category": "French Opus",
     "size": "Modular Set",
     "thickness": "3 CM",
     "finishes": ["Half Honed", "Tumbled", "Handcut"],
     "orderedQuantity": "43.20",
     "unit": "SQM",
     "rate": "650.00"
   }
   ```
3. `sourceReference`: Document traceability metadata:
   - `sourcePage`: Page number in PO PDF
   - `boundingBox`: `[ymin, xmin, ymax, xmax]` normalized coordinates (when parser supports OCR bbox)
   - `textSnippet`: Surrounding context window

---

## 7. Description Intelligence Engine (Swamy Slabs Pilot)

The description engine converts customer order terminology into the supplier's commercial specification without guessing manufacturing history:

### 1. Technical Finish Distinctions:
The engine explicitly recognizes and preserves distinct finishes:
* `Natural` $\to$ `NATURAL`
* `Half Honed` $\to$ `H/H`
* `Tumbled` $\to$ `T/B`
* `Handcut` $\to$ `H/C`
* `Straight Handcut` $\to$ `H/C`
* `Sawn` $\to$ `SAWN`
* `Brushed` $\to$ `BRUSHED`
* `Calibrated` $\to$ `CALIBRATED`

### 2. Independent Field Sequence:
Field order is configured in the business rule and never inferred from manufacturing chronology:
$$\text{Field Sequence: } [\text{stone}, \text{pattern}, \text{size}, \text{thickness}, \text{topFinish}, \text{edgeFinish}, \text{finalFinish}, \text{crateCount}]$$

---

## 8. Asynchronous Processing Queue (Redis + BullMQ)

Long-running I/O operations (PDF parsing, Gemini multimodal API calls, DOCX rendering, PDF compilation) are handled by BullMQ workers:

* **Queues:**
  1. `po-extraction-queue`: Receives PO upload jobs, triggers parsing, and transitions state to `EXTRACTED` or `EXTRACTION_FAILED`.
  2. `document-render-queue`: Receives invoice issuance events, generates DOCX, compiles PDF, and saves artifacts to S3.
* **Worker Resilience:** Exponential backoff retries (3 attempts), job timeouts (90 seconds), and idempotency keys derived from file hashes.

---

## 9. Template Preservation & Isolated PDF Rendering

* **DOCX Engine:** Powered by `docxtemplater` + `pizzip`, dynamically interpolating header metadata, seller/buyer details, repeating table rows (`{#items}...{/items}`), and tax breakdowns.
* **PDF Conversion Worker:** Dedicated isolated container/worker converting DOCX to high-fidelity PDF via headless conversion.
* **Testing Reality:** Automated rendering tests verify template token coverage and table iteration. Cross-platform rendering preserves layout structure rather than claiming impossible pixel-perfection across differing operating system font engines.
