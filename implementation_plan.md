# Implementation Plan - Vehicle Service Ticketing System & Kanban

A fast, keyboard-first, lightweight Node.js + SQLite Vehicle Service Ticketing Application. Features an interactive Kanban board (**Open**, **In Progress**, **Closed**), dynamic Working-Days (WD) SLA tracking, non-invasive auto-learning master databases (Customers, Vehicles, Parts, Insurance Companies, Surveyors), pipeline bypass/early closure, and a clean, utilitarian **white mode** interface.

---

## User Review Required

> [!IMPORTANT]
> **Working Days & Calendar**:
> - Working days: **Monday through Saturday** (Sundays are non-working days).
> - Customizable workshop holidays via `config/holidays.json` and API.

> [!IMPORTANT]
> **Non-Invasive Master DBs with Reciprocal Typeahead Auto-Fill**:
> - **Customers & Vehicles**: Multi-phone and multi-vehicle support per customer. Typing any field (**Customer Name**, **Phone**, **Vehicle Reg No**, or **Chassis No**) triggers immediate autocomplete suggestions. Selecting a suggestion auto-fills all linked fields. If the entry is new, it is seamlessly saved to the database upon submission without separate setup screens. All fields remain directly re-editable.
> - **Parts DB**: Suggests parts and default costs during Estimate and Parts Order stages. New parts entered on-the-fly are automatically added to the parts catalog.
> - **Insurance & Surveyors**: Insurance companies are mapped to surveyors. Selecting an insurer cascades and filters surveyor suggestions. Selecting a surveyor auto-fills their phone number and linked insurer (and vice-versa). New insurers/surveyors are captured automatically if not yet in the DB.

> [!IMPORTANT]
> **Pipeline Bypass & Early Vehicle Delivery**:
> - At **Stage 9 (Work Complete)** or any stage, if a customer pays directly before insurance intimation/survey clearance and picks up the vehicle, the user can choose **"Bypass Pipeline & Close Ticket"**.
> - Requires confirmation with a warning dialog and optional/mandatory notes for audit tracking.

> [!IMPORTANT]
> **Design & UX Guidelines**:
> - **Crisp White Mode / Minimalist**: High-contrast, clean, uncluttered white-and-light-slate layout with subtle Honda red accents.
> - **Zero AI Sloppiness**: Concise labels, no unnecessary fluff or wordy explanatory paragraphs.
> - **Keyboard-First Data Entry**: Smooth `Tab` index navigation, `Enter` to pick suggestions, `Ctrl+Enter` to submit, `Ctrl+N` / `Alt+N` for new ticket, `Esc` to cancel/dismiss modals.

> [!IMPORTANT]
> **SLA Breach Alerting, EOD Executive Action & Future Roadmap ([todo.txt](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/todo.txt))**:
> - **In-App Alerting**: Visual SLA breach badges (🔴) and an SLA Breaches drawer.
> - **End-of-Day (EOD) Report Trigger (Placeholder)**: A manual button *"Send EOD Breach Report"* for executives at day-end. Per your instruction, live email dispatch and cron jobs are **not** executed now; instead, it generates the structured breach summary and provides a clean placeholder preview.
> - **Future Implementation Tracking ([todo.txt](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/todo.txt))**: We will maintain `todo.txt` tracking:
>   1. Google Apps Script Web App email push integration for the EOD report.
>   2. Automated cron job for scheduled email alerts.
>   3. Google Sheets (GSheet) integration for workshop ticketing sync and analytics.

---

## Workflow & Stage Mapping

The system supports the 12-stage workflow with optional branches and early closure mapped to the 3 Kanban columns:

| Kanban Column | Stages Included | Stage Description & Maximum SLA |
| :--- | :--- | :--- |
| **Open** | **Stage 1: Vehicle Arrival** | Starting point. Ticket created with Outlet, Customer Name, Phone, Vehicle Reg No, Vehicle Model, Chassis Number. Ticket stays in Open until estimate preparation starts. |
| **In Progress** | **Stage 2: Estimate Preparation** | **In Progress starts here.** 2 WD SLA. Damaged parts entered (with auto-suggest from Parts DB) and estimated cost logged. |
| | **Stage 3: Insurance Intimation** | 1 WD SLA. Date sent to insurance company, Insurance Company Name (auto-suggested / inline add). |
| | **Stage 4: Survey** | 3 WD SLA. Surveyor Name & Phone (cascaded from selected insurer or auto-filled; inline add). |
| | **Stage 5: Approval** | 2 WD SLA. Surveyor approval date logged. |
| | **Stage 6: Parts Order** *(Optional)* | 1 WD SLA. Required parts ordered if not available. |
| | **Stage 7: Parts Arrival** *(Optional)* | 10 WD max SLA. Parts arrival logged. |
| | **Stage 8: Work Start** | 2 WD SLA. Starts after Approval (or Parts Arrival if parts ordered). |
| | **Stage 9: Work Complete** | 3 WD SLA. Repair work completed. **Early Delivery / Pipeline Bypass available here** if customer pays before insurance. |
| | **Stage 10: Invoice** | 1 WD SLA. Invoice sent to customer. |
| | **Stage 11: Resurvey** *(Optional)* | 2 WD SLA. Applicable if surveyor requires resurvey. |
| **Closed** | **Stage 12: Customer Delivery** | 15 WD max SLA. Vehicle delivered to customer, final SLA marked complete, ticket closed. (Also reached immediately if bypassed at Stage 9). |

### SLA Status Badges
- 🟢 **Within SLA**: Remaining working days > 1.
- 🟠 **SLA Due Soon**: 0 or 1 working day remaining before breach.
- 🔴 **SLA Breached**: Working days exceeded the stage allowance (triggers breach alert).
- ⚪ **Not Started / Pending**: Future stage.
- ✅ **Completed**: Stage finished.

---

## Database Schema (`SQLite`)

SQLite database (`data/tickets.db`) initialized with the following relational schema:

1. **`outlets`**: `id`, `name`, `code`, `location`, `is_active`
2. **`customers`**: `id`, `name`, `primary_phone`, `created_at`
3. **`customer_phones`**: `id`, `customer_id`, `phone`
4. **`vehicles`**: `id`, `customer_id`, `vehicle_no`, `vehicle_name`, `chassis_no`, `created_at`
5. **`parts`**: `id`, `part_code`, `part_name`, `default_cost`, `stock_qty`, `created_at`
6. **`insurance_companies`**: `id`, `name`, `contact_info`, `created_at`
7. **`surveyors`**: `id`, `name`, `phone`, `created_at`
8. **`surveyor_insurance_map`**: `surveyor_id`, `insurance_company_id`
9. **`tickets`**:
   - `id`, `ticket_number`, `outlet_id`, `customer_id`, `vehicle_id`
   - Snapshot fields: `outlet_name`, `customer_name`, `customer_phone`, `vehicle_no`, `vehicle_name`, `chassis_number`
   - Stage tracking: `current_stage_id`, `status` (`OPEN`, `IN_PROGRESS`, `CLOSED`)
   - Branch flags: `parts_order_required` (0/1), `resurvey_required` (0/1)
   - Bypass flags: `is_bypassed` (0/1), `bypass_stage_id`, `bypass_reason`, `bypassed_at`
   - Stage dates & data: `arrival_date`, `estimate_date`, `damaged_parts`, `estimated_cost`, `insurance_intimation_date`, `insurance_company`, `survey_date`, `surveyor_name`, `surveyor_phone`, `approval_date`, `parts_order_date`, `parts_arrival_date`, `work_start_date`, `work_complete_date`, `invoice_date`, `resurvey_date`, `delivery_date`, `closure_date`
   - `created_at`, `updated_at`
10. **`stage_logs`**: `id`, `ticket_id`, `stage_id`, `stage_name`, `entered_at`, `completed_at`, `sla_limit_wd`, `elapsed_wd`, `sla_status`, `data_json`
11. **`sla_alerts`**: `id`, `ticket_id`, `outlet_id`, `stage_id`, `breached_at`, `days_overdue`, `status`

---

## Proposed Changes

### Configuration & Data (`config/`, `data/`)

#### [NEW] [config/holidays.json](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/config/holidays.json)
- Array of workshop holidays (e.g., `[{"date": "2026-01-26", "name": "Republic Day"}, ...]`).

#### [NEW] [config/alerts.json](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/config/alerts.json)
- Google Apps Script webhook integration config placeholder (`gasWebAppUrl`, `enabled`, `notificationEmails`).

#### [NEW] [todo.txt](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/todo.txt)
- Structured backlog tracking future implementations:
  1. Manual EOD breach report dispatch to managers via Google Apps Script Web App.
  2. Automated cron job scheduler for periodic email alerts.
  3. Google Sheets (GSheet) sync integration for workshop analytics.

---

### Backend Service (`server/`)

#### [NEW] [package.json](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/package.json)
- Dependencies: `express`, `cors`, `sqlite3`, `dotenv`. Zero complex build tooling.

#### [NEW] [server/db.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/db.js)
- SQLite connection and automatic schema table creation.
- Non-invasive customer/vehicle upsert logic: finds or creates customer, attaches phones and vehicles automatically.
- Non-invasive parts upsert and search.
- Non-invasive insurance and surveyor auto-mapping logic.
- Pre-seeds sample Honda outlets (Downtown, Northside, East Bay), sample vehicles (City, Elevate, Civic, Amaze), parts catalog, and insurance partners.

#### [NEW] [server/slaEngine.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/slaEngine.js)
- Working days calculation: Monday to Saturday (Sundays excluded) minus dates in `config/holidays.json`.
- Dynamic SLA calculation for each ticket stage against real-time.
- Flagging: 🟢 Within SLA, 🟠 Due Soon (<= 1 WD), 🔴 Breached.

#### [NEW] [server/alertService.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/alertService.js)
- Scans breached tickets grouped by outlet.
- Formats structured breach summary payload (JSON) for manager reports (used by UI placeholder for preview; live email push deferred to Phase 2 per `todo.txt`).

#### [NEW] [server/server.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/server/server.js)
- REST API:
  - **Autocomplete / Lookup endpoints**:
    - `GET /api/lookup/customers?q=...`: Search by name, phone, vehicle reg, or chassis. Returns matching customer profiles with linked vehicles.
    - `GET /api/lookup/parts?q=...`: Search parts catalog.
    - `GET /api/lookup/insurers?q=...`: Search insurance companies.
    - `GET /api/lookup/surveyors?q=...&insurerId=...`: Search surveyors (optionally filtered by insurer).
  - **Ticket endpoints**:
    - `GET /api/tickets`: List with filters (`outletId`, `slaStatus`, `search`).
    - `GET /api/tickets/:id`: Detailed ticket with full history.
    - `POST /api/tickets`: Create new ticket (auto-upserts customer & vehicle if new).
    - `PUT /api/tickets/:id`: Update ticket fields (re-editable).
    - `PUT /api/tickets/:id/advance`: Move to next stage with stage inputs.
    - `PUT /api/tickets/:id/bypass`: Bypass pipeline and close ticket with reason notes.
  - **Outlets & Alerts**:
    - `GET /api/outlets`: List outlets.
    - `GET /api/alerts/breaches`: Active SLA breaches.
    - `POST /api/alerts/test-gas`: Test Google Apps Script push.
    - `GET /api/metrics`: Real-time SLA counters.

---

### Frontend Web Application (`public/`)

#### [NEW] [public/index.html](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/index.html)
- Clean, minimal white mode UI layout.
- Top bar: Minimal header with active SLA pill badges (🔴 Breached, 🟠 Due Soon, 🟢 Normal, ✅ Closed), Outlet Selector, and **🚨 SLA Alerts** button.
- Action bar: Search input, SLA filter, Outlet filter, View Switcher (Kanban vs Pipeline vs Table), and `+ New Ticket` button (hotkey `Alt+N`).
- 3 Kanban columns:
  - **Open** (Stage 1: Vehicle Arrival)
  - **In Progress** (Stage 2: Estimate Preparation through Stage 11)
  - **Closed** (Stage 12: Delivered / Bypassed)
- Modals:
  - **New Ticket Modal**: Fast keyboard navigation (`Tab` / `Enter`). Reciprocal autocomplete on Customer Name, Phone, Vehicle No, Chassis No.
  - **Stage Advance Modal**: Minimal dynamic fields with auto-suggest for Parts, Insurer, and Surveyor.
  - **Bypass / Early Close Modal**: Warning prompt with reason input for early pickup before insurance.
  - **Ticket Detail & Edit Drawer**: Clean audit log, SLA breakdown, and inline edit capability.
  - **SLA Alert Center**: List of breached tickets with "Test Google Apps Script Dispatch".

#### [NEW] [public/css/styles.css](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/css/styles.css)
- Minimalist, crisp **white mode**: `#ffffff` background, subtle `#f8fafc` / `#f1f5f9` panels, crisp `#0f172a` typography, Honda red (`#dc2626`) accent.
- No bulky AI decorations, no unnecessary shadows or distracting gradient animations.
- Clear, legible cards with high density for workshop desks.
- Clean dropdown autocomplete menus positioned directly under inputs.

#### [NEW] [public/js/app.js](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/public/js/app.js)
- Keyboard shortcut listeners (`Alt+N` for new ticket, `Esc` to close, arrow/enter for suggestions).
- Debounced autocomplete controller for Customer, Vehicle, Parts, Insurer, and Surveyor lookups.
- Stage progression and bypass controllers.
- Kanban drag-and-drop and column sync.

---

## Verification Plan

### Automated / Server Tests
- Run test scripts (`node test/slaEngine.test.js`, `node test/db.test.js`):
  - Verify Monday–Saturday working days calculation with holiday exclusion.
  - Verify non-invasive customer & vehicle creation from ticket intake.
  - Verify reciprocal auto-lookup (searching by phone returns customer & vehicle; searching by vehicle returns customer).
  - Verify insurer-surveyor cascading and parts autocomplete.
  - Verify Stage 9 early bypass closes ticket and logs audit reason.
  - Verify Google Apps Script payload format for breached tickets.

### Manual Verification
1. Open `http://localhost:3000` in browser.
2. Verify crisp white mode presentation and clean top stats bar.
3. Press `Alt+N` to open New Ticket modal.
4. Test Autocomplete:
   - Type an existing customer name or vehicle number → verify phone, vehicle name, and chassis auto-fill.
   - Enter a brand new customer & vehicle → submit → verify ticket appears in **Open** column and new customer/vehicle is saved to SQLite DB.
5. Advance to Stage 2 (Estimate Preparation) → verify ticket moves to **In Progress**.
   - Type part name → verify suggestions appear from Parts DB; enter custom price.
6. Advance through Insurance Intimation and Survey:
   - Select Insurance Company → verify surveyor suggestions are filtered.
   - Select Surveyor → verify surveyor phone number auto-fills.
7. Test Pipeline Bypass:
   - At Stage 9 (Work Complete), click "Bypass Pipeline & Close" → confirm warning with note → verify ticket moves directly to **Closed**.
8. Test SLA Alerts:
   - Open SLA Alerts panel → verify breached tickets are displayed with days overdue.
   - Click "Test Apps Script Webhook" → verify payload structure.
