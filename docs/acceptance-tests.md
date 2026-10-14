# InvoiceAI: Acceptance Tests & Quality Gates Specification

**Document Version:** 1.1 (Phase 0 Architectural Corrections Applied)  
**Scope:** Pilot Quality Gates, Test Matrix & Verification Protocols  

---

## 1. Measurable Pilot Performance Targets

| Quality Metric | Target Threshold | Validation Method |
| :--- | :--- | :--- |
| **PO Header Field Accuracy** | $\ge 95\%$ | Automated benchmark comparison against ground truth fixtures |
| **Line-Item Field Accuracy** | $\ge 98\%$ | Item-level attribute matching (size, thickness, finishes, rate) |
| **Arithmetic Precision** | **100%** | Zero floating-point rounding errors ($Q \times R - D = \text{Amount}$) |
| **Approved Rule Reproduction** | **100% Deterministic** | Exact match against approved company description dictionary |
| **Security Tenant Isolation** | **Zero Exposure** | Cross-tenant test suite covering API, queries, workers, and S3 |
| **Invoice Sequence Integrity** | **Unbroken Sequential** | Stress test with concurrent issuance requests |

---

## 2. Core Acceptance Scenarios

### Scenario 1: Swamy Slabs Benchmark PO Extraction (`POM14356A`)
* **Input Document:** Swamy Slabs PO `POM14356A` from Global Impex Private Limited.
* **Pass Criteria:**
  - AI extraction extracts **all 5 line items** without row truncation.
  - Header data matches: PO number `POM14356A`, Date `2026-09-09`, Buyer `Global Impex Private Limited`.
  - Quoted Goods Total matches: ₹1,97,880.00.
  - Extraction retains `rawValue`, `normalizedValue`, and `sourcePage` for every field.

### Scenario 2: Description Engine & Stone Finish Discrimination
* **Input Specifications:**
  - Item 1: `T. Yellow Palisade, 100x50 cm, 3-5 cm, Natural, Straight Handcut, 3 Crates`
  - Item 4: `T. Yellow Tiles, 60x40 cm, 2 cm, Half Honed, Calibrated, Handcut, Tumbled, Brushed, 5 Crates`
  - Item 5: `T. Yellow French Opus, 3 cm, Half Honed, Calibrated, Handcut, Tumbled, Brushed, 3 Crates`
* **Pass Criteria:**
  - Straight Handcut and Handcut are accurately resolved to `H/C`.
  - Finishes are distinctly resolved: `Natural` $\to$ `NATURAL`, `Half Honed` $\to$ `H/H`, `Tumbled` $\to$ `T/B`, `Brushed` $\to$ `BRUSHED`.
  - Item 5 outputs French Opus modular tile set breakdown:
    `20X20 - 2PC | 40X20 - 1PC | 40X40 - 2PC | 60X40 - 1PC`
  - Description output matches:
    `T.YELLOW, FRENCH OPUS, MODULAR SET, 3 CM, H/H, CALIBRATED, H/C, T/B, BRUSHED, 3CRT`
  - Order of elements follows approved `fieldOrder`, independent of physical quarrying/finishing chronology.

### Scenario 3: Place-of-Supply & Statutory GST Calculation
* **Test Case 3A (Interstate IGST):**
  - Supplier: Swamy Slabs (Telangana, State Code `36`)
  - Recipient Delivery Site: Bengaluru, Karnataka (State Code `29`)
  - HSN: `6802` @ 18%
  - Subtotal: ₹1,97,880.00
  - *Expected Result:* CGST = ₹0.00, SGST = ₹0.00, IGST (18%) = ₹35,618.40, Round Off = ₹-0.40, Grand Total = ₹2,33,498.00.
* **Test Case 3B (Intrastate CGST + SGST):**
  - Supplier: Swamy Slabs (Telangana, State Code `36`)
  - Recipient Delivery Site: Hyderabad, Telangana (State Code `36`)
  - Subtotal: ₹1,97,880.00
  - *Expected Result:* CGST (9%) = ₹17,809.20, SGST (9%) = ₹17,809.20, IGST = ₹0.00, Grand Total = ₹2,33,498.00.
* **Test Case 3C (Bill-To / Ship-To Third Party):**
  - Consignee in Telangana, but Buyer billing entity in Maharashtra (Third-party supply).
  - *Expected Result:* Under Sec 10(1)(b) of IGST Act, Place of Supply is Maharashtra $\implies$ Interstate IGST applies.

### Scenario 4: Partial Shipment & Cumulative Reconciliation
* **Order Line:** 100.80 SQM ordered on Line 4.
* **Shipment 1:** Dispatch staff confirms 60.00 SQM dispatched on Truck 1.
  - *Result:* Invoice 1 issued for 60.00 SQM. Remaining balance = 40.80 SQM. PO status = `PARTIALLY_INVOICED`.
* **Shipment 2:** Second invoice created against same PO. Dispatches remaining 40.80 SQM.
  - *Result:* Invoice 2 issued for 40.80 SQM. Remaining balance = 0.00 SQM. PO status = `FULLY_INVOICED`.
* **Over-Dispatch Guard:** If dispatch attempts to invoice 50.00 SQM on Shipment 2 (exceeding 40.80 SQM balance):
  - *Result:* System raises `OVER_DISPATCH_WARNING` and blocks issuance without supervisor override.

### Scenario 5: Duplicate Document Upload Detection
* **Action:** Upload exact same PO PDF twice.
* **Pass Criteria:**
  - System computes SHA-256 hash.
  - Second upload triggers a warning: *"Duplicate document detected: This exact file has already been uploaded as PO POM14356A"*.
  - User can view existing PO or proceed with an authorized re-order override.

### Scenario 6: Approval Invalidation on Mutation
* **Action:**
  1. Draft invoice is reviewed and approved by Owner/Admin (status = `APPROVED`, `approvedBy` populated).
  2. Accounts user edits unit rate or dispatched quantity.
* **Pass Criteria:**
  - Invoice status immediately reverts to `NEEDS_REVIEW`.
  - `approvedBy` and `approvedAt` are cleared.
  - System logs audit event `APPROVAL_REVOKED_BY_MUTATION`.
  - Issuance is blocked until re-approved.

### Scenario 7: Multi-Tenant Security & Isolation
* **Test Case 7A:** User from Tenant B attempts `GET /api/purchase-orders/:idOfTenantA`.
  - *Result:* HTTP 404 (or 403 Forbidden). No data leaked.
* **Test Case 7B:** Worker job for Tenant A tries to read S3 key `tenants/tenantB/pos/...`.
  - *Result:* Storage driver rejects request with unauthorized access exception.

### Scenario 8: Concurrency-Safe Invoice Numbering
* **Action:** Simulate 10 simultaneous issue requests on approved drafts for Tenant A.
* **Pass Criteria:**
  - 10 distinct, contiguous invoice numbers generated (`INV/2026-27/0001` to `INV/2026-27/0010`).
  - Zero duplicate invoice numbers.
  - Zero sequence gaps.

### Scenario 9: Template Preservation & DOCX Rendering
* **Action:** Compile approved invoice using Swamy Slabs template.
* **Pass Criteria:**
  - Generated `.docx` binary opens in Microsoft Word without format corruption errors.
  - Headers, company details, repeating item rows, and summary totals correctly populated.
  - PDF conversion worker produces visually aligned PDF.
