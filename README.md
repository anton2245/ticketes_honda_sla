# Honda Vehicle Service Ticketing & SLA Tracking System

A specialized automotive service workflow and Kanban management desktop application built for Honda service workshops. Features strict **Working-Days SLA tracking**, role-based access control, real-time stage transitions, notes with user mentions, and notification alerts.

Runs as a modern **standalone desktop Electron application** with hot reload support, or as a traditional Node.js/Express web server backed by **Supabase PostgreSQL**.

---

## Key Features

- **13-Stage Workshop Kanban Workflow**: Follows the complete automotive lifecycle from vehicle reception, preliminary inspection, job card estimation, parts procurement/ordering, mechanical repair, quality control inspection, washing, to invoicing and final customer delivery.
- **Strict Working-Days SLA Engine**:
  - Calculates deadlines strictly using workshop working days (**Monday through Saturday**).
  - Automatically skips non-working days (**Sundays**) and configured public holidays (`config/holidays.json`).
  - Real-time SLA health badges: `Within SLA` (Green), `Due Soon` (Amber warning), and `Breached` (Red alert).
- **Interactive Notes & User Mentions**:
  - Threaded service notes per ticket.
  - `@username` tagging that dispatches real-time alerts to the mentioned user.
  - Separate alert tabs for **User Mentions** and **End-of-Day (EOD) SLA Breach Digests**.
- **Multi-Outlet Workshop Management**:
  - Filter tickets, analytics, and workloads across multiple workshop outlets.
- **Standalone Electron Desktop App**:
  - Clean desktop window without top menu clutter.
  - Built-in live hot reload during development.
  - Single-file portable `.exe` distribution.
- **Enterprise Cloud Database**:
  - Powered by **Supabase PostgreSQL** with auto-reconnecting connection pooler and automated database schema provisioning (`server/db.js`).

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron 44+ |
| **Backend Runtime** | Node.js (Express, `pg`, `@supabase/supabase-js`, `dotenv`) |
| **Database** | PostgreSQL on Supabase |
| **Frontend** | Vanilla JavaScript, HTML5, Modern CSS (Responsive Kanban & Table views) |
| **Packaging** | `electron-builder` (Portable Windows `.exe`) |

---

## Project Structure

```
├── electron/
│   ├── main.js             # Electron main process, hot reload watchers & server lifecycle
│   ├── preload.js          # Secure context isolation bridge
│   └── menu.js             # Application menu configuration
├── server/
│   ├── server.js           # Express REST API endpoints & server module
│   ├── db.js               # Supabase PostgreSQL database connection & queries
│   ├── slaEngine.js        # Strict working-days SLA business logic
│   └── alertService.js     # User mentions, notes & EOD alert push engine
├── public/
│   ├── index.html          # Main application dashboard & modals
│   ├── css/styles.css      # Core design system & Kanban styling
│   └── js/app.js           # Client-side UI logic, state management & API client
├── config/
│   ├── holidays.json       # Configurable list of official workshop holidays
│   └── alerts.json         # Alert thresholds and notification preferences
├── dist/                   # Packaged Windows executables (.exe)
├── package.json            # Dependencies, build configs & npm scripts
└── .env                    # Database credentials & environment variables
```

---

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher recommended; developed on Node v25)
- **npm** (v9 or higher)

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd Service_Ticket
npm install
```

### 2. Environment Configuration

Create or configure the `.env` file in the project root:

```env
PORT=3000

# Supabase PostgreSQL Connection
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# PostgreSQL Direct Connection / Pooler URL
DATABASE_URL=postgresql://postgres:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

The database tables, initial stages, outlets, and sample tickets are automatically provisioned on first startup via `server/db.js`.

---

## Running the Application

### Option A: Standalone Desktop App (Recommended)

#### Development Mode (with Live Hot Reload)
Launches the Electron desktop app with live watching enabled:
- **Frontend changes** (`public/`): Window automatically reloads in ~150ms.
- **Backend changes** (`server/`): Electron application automatically restarts.
- **`F12`**: Toggles Chrome Developer Tools.

```bash
npm run dev
```

#### Production Mode
Launches the desktop application normally:

```bash
npm start
```

### Option B: Web Server Only (Headless / Browser)

If you only want to run the Express backend server:

```bash
# Run server standalone
npm run server

# Run server with Node's native auto-restart watcher
npm run server:dev
```
Then open `http://localhost:3000` in your web browser.

---

## Developer Mode Toggle

In [`electron/main.js`](file:///c:/Users/ANTON/Programing/Honda/Service_Ticket/electron/main.js), you can force Developer Mode on or off using the boolean flag:

```javascript
// Set to true to force Dev Mode ON, false for Production, or null for auto-detect:
const DEV_MODE_OVERRIDE = null;
```

---

## Packaging to Windows `.exe`

To compile and package the entire system into a standalone Windows executable:

```bash
npm run build:exe
```

The output will be placed in the `dist/` directory:
- **`dist/Honda Service Ticket SLA 1.0.0.exe`**: Portable single-file executable that requires no installation.
- **`dist/win-unpacked/`**: Unpacked directory for direct testing.

---

## Running Automated Tests

Run the test suite covering the SLA engine, holiday calculations, and stage branching:

```bash
npm test
```

To run the notes and alerts verification script:

```bash
node test_notes_and_alerts.js
```

---

## Keyboard Shortcuts (Desktop App)

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + R` / `Cmd + R` | Reload Dashboard |
| `Ctrl + Shift + R` | Hard Reload (Clear Cache) |
| `F12` | Toggle Developer Tools (in Dev Mode) |
| `Ctrl + B` | Toggle Left Navigation Sidebar |

---

## License

ISC License. Internal automotive operations tool for Honda workshop service teams.
