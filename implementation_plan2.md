# Implementation Plan: CA & PCA Quantity Metrics & Dedicated Modals

Upgrade the CA and PCA lifecycle tags on Kanban ticket cards to display real quantity metrics, and provide dedicated interactive modals when clicking them:
- **CA Tag**: Shows `CA (customer approved qty / total qty needing customer approval)` and opens a dedicated **CA Purchase & Stock Allocation Modal**.
- **PCA Tag**: Shows `PCA (pending approval qty)` and opens a dedicated **PCA Resolution Modal** with one-click Customer Approval vs Insurance Claim options.

---

## Proposed Changes

### Backend (`server/`)

#### [MODIFY] [server.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/server.js)
- Update `/api/tickets` and `/api/tickets/:id` SQL queries to aggregate and return:
  - `ca_qty`: `SUM(COALESCE(customer_approved_qty, 0))`
  - `cust_needed_qty`: `SUM(CASE WHEN COALESCE(quantity, 1) > COALESCE(insurance_approved_qty, 0) THEN COALESCE(quantity, 1) - COALESCE(insurance_approved_qty, 0) ELSE 0 END)`
  - `pca_pending_qty`: `SUM(CASE WHEN COALESCE(quantity, 1) > COALESCE(insurance_approved_qty, 0) + COALESCE(customer_approved_qty, 0) THEN COALESCE(quantity, 1) - COALESCE(insurance_approved_qty, 0) - COALESCE(customer_approved_qty, 0) ELSE 0 END)`

#### [MODIFY] [db.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/db.js)
- Update `getTicketPartsStats` to return `caQty`, `custNeededQty`, and `pcaPendingQty`.
- Allow `updateTicketPartApproval` to also support `locators` updates when picking warehouse batch stock during CA purchase.

---

### Frontend UI (`public/`)

#### [MODIFY] [index.html](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/index.html)
- Add **`#modalPcaResolution`**:
  - Modal specifically for resolving pending customer approvals (PCA).
  - Displays pending items with current insurance vs pending quantity.
  - Interactive choices per item: **Customer Approval** or **Claim / Insurance**.
  - Bulk actions: "Approve All as Customer (CA)" and "Cover All under Claim (Insurance)".
- Add **`#modalCaPurchase`**:
  - Modal specifically for purchasing / ordering customer-approved parts (CA).
  - Displays list of CA parts with customer-approved quantity and current order status.
  - Shows available warehouse stock and locator information for each part.
  - Allows user to allocate from in-stock warehouse locators or place purchase order (`ORDERED`).

#### [MODIFY] [styles.css](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/css/styles.css)
- Add styling for PCA Resolution modal cards, toggles, and bulk buttons.
- Add styling for CA Purchase modal stock indicators, locator chips, and procurement action buttons.

#### [MODIFY] [app.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/js/app.js)
- Update `renderTicketCardPartApprovalBadges`:
  - PCA tag renders: `PCA (${pcaPendingQty})` and calls `openPcaApprovalModal(t.id)`.
  - CA tag renders: `CA (${caQty}/${custNeededQty})` and calls `openCaPurchaseModal(t.id)`.
- Implement `openPcaApprovalModal(ticketId)`:
  - Fetches ticket parts, filters for parts where pending quantity > 0.
  - Renders decision controls (Customer vs Claim) and saves changes.
- Implement `openCaPurchaseModal(ticketId)`:
  - Fetches ticket parts, filters for customer-approved parts (`customer_approved_qty > 0`).
  - Fetches available stock/locators for each part.
  - Provides stock allocation and purchase ordering actions.

---

## Verification Plan

### Automated / Syntax Tests
- Test syntax of modified server and client files (`node -c server/server.js`).
- Verify endpoints `/api/tickets` return the updated `ca_qty`, `cust_needed_qty`, and `pca_pending_qty` fields.

### Manual Verification
1. Inspect ticket cards on Kanban board:
   - Verify PCA badge displays `PCA (N)` where N is pending quantity.
   - Verify CA badge displays `CA (X/Y)` where X is customer-approved qty and Y is total needing customer approval.
2. Click on **PCA tag**:
   - Verify dedicated `#modalPcaResolution` opens.
   - Verify choosing "Customer Approval" or "Claim" updates the parts correctly.
3. Click on **CA tag**:
   - Verify dedicated `#modalCaPurchase` opens showing only customer-approved parts.
   - Verify available warehouse stock is displayed.
   - Verify purchasing/ordering updates part status to `ORDERED` or allocates available stock.
