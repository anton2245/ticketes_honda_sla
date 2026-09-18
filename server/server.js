const path = require('path');
const fs = require('fs');

// Ensure .env is loaded whether running standalone, in dev, or packaged in electron
const envPaths = [
  path.join(__dirname, '..', '.env'),
  process.resourcesPath ? path.join(process.resourcesPath, '.env') : null,
  path.join(process.cwd(), '.env')
].filter(Boolean);

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}
// Fallback to standard dotenv config if none matched
if (!process.env.SUPABASE_URL) {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const db = require('./db');
const slaEngine = require('./slaEngine');
const alertService = require('./alertService');
const stockSync = require('./stockSync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Raw binary body parser for Excel spreadsheets upload
app.use('/api/stock/upload-xlsx', express.raw({
  type: [
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    '*/*'
  ],
  limit: '60mb'
}));

app.use(express.json({ limit: '60mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve Supabase JS client for browser / Electron
app.get('/js/vendor/supabase.js', (req, res) => {
  const localUmd = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
  if (fs.existsSync(localUmd)) {
    res.sendFile(localUmd);
  } else {
    res.redirect('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  }
});

// Public endpoint for Supabase Realtime Client initialization
app.get('/api/config/supabase-client', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || 'https://kjoeprnucqabgfkwbqdg.supabase.co',
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
  });
});

// Initialize database schema, seeds, and physical stock model on startup
db.initDb().then(async () => {
  console.log('✓ Supabase PostgreSQL database initialized successfully.');
  try {
    const pool = await db.getPool();
    await stockSync.ensureStockSchema(pool);
    console.log('✓ Physical stock schema and indexes verified.');
  } catch (err) {
    console.error('Physical stock schema initialization warning:', err.message);
  }
}).catch(err => {
  console.error('Failed to initialize database:', err);
});

// ==========================================
// AUTHENTICATION & ACCESS CONTROL MIDDLEWARE
// ==========================================

async function authenticateUser(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'].trim();
    } else if (req.query && req.query.token) {
      token = req.query.token.trim();
    }

    if (!token) {
      // Test suite bypass header
      if (req.headers['x-internal-test'] === 'honda-admin') {
        const admin = await db.getUserByUsername('admin');
        if (admin) {
          req.user = {
            id: admin.id,
            username: admin.username,
            displayName: admin.display_name,
            role: admin.role,
            isActive: true,
            permissions: await db.getUserStagePermissions(admin.id, admin.role)
          };
          return next();
        }
      }
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    const user = await db.validateSession(token);
    if (!user) {
      return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function optionalAuthenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'].trim();
    } else if (req.query && req.query.token) {
      token = req.query.token.trim();
    }

    if (token) {
      const user = await db.validateSession(token);
      if (user) {
        req.user = user;
        req.token = token;
      }
    } else if (req.headers['x-internal-test'] === 'honda-admin') {
      const admin = await db.getUserByUsername('admin');
      if (admin) {
        req.user = {
          id: admin.id,
          username: admin.username,
          displayName: admin.display_name,
          role: admin.role,
          isActive: true,
          permissions: await db.getUserStagePermissions(admin.id, admin.role)
        };
      }
    }
    next();
  } catch (err) {
    next();
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Administrator privileges required.' });
  }
  next();
}

function hasStagePermission(user, stageId, action) {
  if (!user) return true; // If no user object attached in unauthenticated fallback mode
  if (user.role === 'admin') return true;
  const numStageId = parseInt(stageId, 10);
  const perm = (user.permissions || []).find(p => p.stage_id === numStageId);
  if (!perm) return false;
  if (action === 'read') return perm.can_read === 1;
  if (action === 'write') return perm.can_write === 1;
  if (action === 'delete') return perm.can_delete === 1;
  return false;
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = await db.getUserByUsername(username.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact an administrator.' });
    }

    const isValid = db.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const session = await db.createSession(user.id);
    const permissions = await db.getUserStagePermissions(user.id, user.role);

    res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        role: user.role,
        isActive: true,
        permissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/auth/logout', authenticateUser, async (req, res) => {
  try {
    await db.deleteSession(req.token);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current user profile & permissions
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  res.json({
    user: req.user
  });
});

// Change own password
app.post('/api/auth/change-password', authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const user = await db.getUserByUsername(req.user.username);
    const isValid = db.verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    await db.resetUserPassword(user.id, newPassword);
    res.json({ success: true, message: 'Password changed successfully. Please log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USER MANAGEMENT ROUTES (ADMIN ONLY)
// ==========================================

// List all users
app.get('/api/users', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user (admin can create other admins or users)
app.post('/api/users', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { username, password, displayName, role, isActive, permissions } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and initial password are required.' });
    }
    const newUser = await db.createUser({
      username,
      password,
      displayName,
      role: role === 'admin' ? 'admin' : 'user',
      isActive: isActive !== undefined ? isActive : 1,
      permissions
    });
    res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get active users for @mention autocomplete suggestions
app.get('/api/users/mention-list', optionalAuthenticate, async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, display_name, role FROM users WHERE is_active = 1 ORDER BY username ASC;');
    res.json(users || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user details
app.get('/api/users/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user details (display name, role, active status)
app.put('/api/users/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { displayName, role, isActive } = req.body;
    const updated = await db.updateUser(req.params.id, { displayName, role, isActive });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin reset user password
app.post('/api/users/:id/reset-password', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required.' });
    await db.resetUserPassword(req.params.id, newPassword);
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin toggle user active / deactivate
app.post('/api/users/:id/toggle-active', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const updated = await db.toggleUserActive(req.params.id, isActive);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete user
app.delete('/api/users/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    await db.deleteUser(req.params.id);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get user stage permissions
app.get('/api/users/:id/permissions', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const user = await db.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const perms = await db.getUserStagePermissions(user.id, user.role);
    res.json(perms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user stage permissions
app.put('/api/users/:id/permissions', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be an array of stage permissions.' });
    }
    const updatedPerms = await db.setUserStagePermissions(req.params.id, permissions);
    res.json({ success: true, permissions: updatedPerms });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// BRANCH / OUTLET ENDPOINTS
// ==========================================
app.get(['/api/branches', '/api/outlets'], async (req, res) => {
  try {
    const outlets = await db.all('SELECT id, name, code, location, is_active, created_at FROM outlets WHERE is_active = 1 ORDER BY id ASC;');
    const branches = outlets.map(o => ({
      ...o,
      branch_name: o.name,
      branch_code: o.code
    }));
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TYPEAHEAD & AUTOCOMPLETE LOOKUP ENDPOINTS
// ==========================================
app.get('/api/lookup/customers', async (req, res) => {
  try {
    const q = req.query.q || '';
    const customers = await db.searchCustomers(q);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/vehicle-models', async (req, res) => {
  try {
    const q = req.query.q || '';
    const customerPhone = req.query.customerPhone || null;
    const models = await db.searchVehicleModels(q, customerPhone);
    res.json(models);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/vehicle-colors', async (req, res) => {
  try {
    const model = req.query.model || null;
    const colors = await db.getVehicleColors(model);
    res.json(colors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/parts', async (req, res) => {
  try {
    const q = req.query.q || '';
    const parts = await db.searchParts(q);
    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/part-locators', async (req, res) => {
  try {
    const code = req.query.code || req.query.partCode || req.query.part_code || '';
    const name = req.query.name || req.query.partName || req.query.part_name || '';
    const locators = await db.getPartLocators(code, name);
    res.json(locators);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/lookup/insurers', async (req, res) => {
  try {
    const q = req.query.q || '';
    const insurers = await db.searchInsurers(q);
    res.json(insurers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/surveyors', async (req, res) => {
  try {
    const q = req.query.q || '';
    const insurerName = req.query.insurerName || null;
    const surveyors = await db.searchSurveyors(q, insurerName);
    res.json(surveyors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STAGES & SLA CONFIGURATION ENDPOINTS
// ==========================================
app.get(['/api/stages', '/api/settings/stages-sla'], (req, res) => {
  res.json(slaEngine.getStagesWithDefaults());
});

app.put('/api/settings/stages-sla', (req, res) => {
  try {
    const { stages } = req.body;
    if (!stages || (!Array.isArray(stages) && typeof stages !== 'object')) {
      return res.status(400).json({ error: 'Invalid payload. "stages" array or object is required.' });
    }
    const updatedStages = slaEngine.updateSlaLimits(stages);
    res.json({ success: true, stages: updatedStages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/stages-sla/reset', (req, res) => {
  try {
    const resetStages = slaEngine.resetSlaLimits();
    res.json({ success: true, stages: resetStages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TICKETS ENDPOINTS
// ==========================================

/**
 * List tickets with SLA evaluation & optional filters (outletId, slaStatus, search)
 */
app.get('/api/tickets', optionalAuthenticate, async (req, res) => {
  try {
    const outletId = req.query.branchId || req.query.outletId;
    const stageId = req.query.stageId || req.query.stage;
    const { slaStatus, search, column, dateField, startDate, endDate } = req.query;
    let query = `
      SELECT t.*,
        COALESCE(tp_stats.total_parts, 0) AS total_parts_count,
        COALESCE(tp_stats.insurance_approved_count, 0) AS insurance_approved_count,
        CASE WHEN t.current_stage_id > 5 THEN COALESCE(tp_stats.pca_count, 0) ELSE 0 END AS pca_count,
        CASE WHEN t.current_stage_id > 5 THEN COALESCE(tp_stats.ca_count, 0) ELSE 0 END AS ca_count,
        CASE WHEN t.current_stage_id >= 6 THEN COALESCE(tp_stats.pod_count, 0) ELSE 0 END AS pod_count,
        COALESCE(tp_stats.arrived_count, 0) AS arrived_parts_count
      FROM tickets t
      LEFT JOIN (
        SELECT ticket_id,
          COUNT(*) AS total_parts,
          SUM(CASE WHEN insurance_approved = 1 OR company_approved = 1 THEN 1 ELSE 0 END) AS insurance_approved_count,
          SUM(CASE WHEN UPPER(COALESCE(customer_approval_status, '')) = 'PENDING' THEN 1 ELSE 0 END) AS pca_count,
          SUM(CASE WHEN UPPER(COALESCE(customer_approval_status, '')) = 'APPROVED' THEN 1 ELSE 0 END) AS ca_count,
          SUM(CASE WHEN UPPER(COALESCE(part_status, '')) = 'ORDERED' THEN 1 ELSE 0 END) AS pod_count,
          SUM(CASE WHEN UPPER(COALESCE(part_status, '')) = 'ARRIVED' THEN 1 ELSE 0 END) AS arrived_count
        FROM ticket_parts
        GROUP BY ticket_id
      ) tp_stats ON tp_stats.ticket_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (outletId && outletId !== 'ALL') {
      const outletIds = (Array.isArray(outletId) ? outletId : String(outletId).split(','))
        .map(x => Number(String(x).trim()))
        .filter(x => !isNaN(x) && x > 0);
      if (outletIds.length === 1) {
        query += ` AND t.outlet_id = ?`;
        params.push(outletIds[0]);
      } else if (outletIds.length > 1) {
        query += ` AND t.outlet_id IN (${outletIds.map(() => '?').join(',')})`;
        params.push(...outletIds);
      }
    }

    if (stageId && stageId !== 'ALL') {
      const stageIds = (Array.isArray(stageId) ? stageId : String(stageId).split(','))
        .map(x => Number(String(x).trim()))
        .filter(x => !isNaN(x) && x > 0);
      if (stageIds.length === 1) {
        query += ` AND t.current_stage_id = ?`;
        params.push(stageIds[0]);
      } else if (stageIds.length > 1) {
        query += ` AND t.current_stage_id IN (${stageIds.map(() => '?').join(',')})`;
        params.push(...stageIds);
      }
    }

    if (column && column !== 'ALL') {
      query += ` AND t.status = ?`;
      params.push(column);
    }

    // Date Range Filtering
    if (startDate || endDate) {
      const allowedDateFields = {
        'arrival_date': 'arrival_date',
        'created_at': 'created_at',
        'current_stage_entered_at': 'current_stage_entered_at',
        'estimate_date': 'estimate_date',
        'survey_date': 'survey_date',
        'approval_date': 'approval_date',
        'parts_order_date': 'parts_order_date',
        'work_complete_date': 'work_complete_date',
        'delivery_date': 'delivery_date'
      };
      const targetCol = allowedDateFields[dateField] || 'arrival_date';
      if (startDate) {
        query += ` AND t.${targetCol} >= ?`;
        params.push(startDate.includes('T') ? startDate : `${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        query += ` AND t.${targetCol} <= ?`;
        params.push(endDate.includes('T') ? endDate : `${endDate}T23:59:59.999Z`);
      }
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (
        t.ticket_number LIKE ? 
        OR t.customer_name LIKE ? 
        OR t.customer_phone LIKE ? 
        OR t.vehicle_no LIKE ? 
        OR t.vehicle_name LIKE ? 
        OR t.model LIKE ? 
        OR t.color LIKE ? 
        OR t.chassis_number LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term, term);
    }

    query += ` ORDER BY t.id DESC;`;

    const rawTickets = await db.all(query, params);
    const now = new Date();

    // Attach dynamic SLA status to every ticket
    const evaluatedTickets = rawTickets.map(t => {
      const stageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === t.current_stage_id);
      const isCompleted = t.status === 'CLOSED';
      const stageEval = slaEngine.evaluateStageSLA(
        t.current_stage_id,
        t.current_stage_entered_at,
        isCompleted ? t.closure_date : null,
        now
      );

      return {
        ...t,
        branch_name: t.outlet_name,
        branch_id: t.outlet_id,
        stageName: stageConfig ? stageConfig.name : `Stage ${t.current_stage_id}`,
        stageDescription: stageConfig ? stageConfig.description : '',
        kanbanColumn: stageConfig ? stageConfig.kanbanColumn : (t.current_stage_id === 1 ? 'OPEN' : (t.current_stage_id === 13 ? 'CLOSED' : 'IN_PROGRESS')),
        slaLimitWD: stageConfig ? stageConfig.slaLimitWD : null,
        slaElapsedWD: stageEval.elapsedWD,
        slaRemainingWD: stageEval.remainingWD,
        slaStatus: stageEval.status, // WITHIN_SLA, DUE_SOON, BREACHED, COMPLETED
        slaBadge: stageEval.badge,
        isBreached: stageEval.isBreached,
        isDueSoon: stageEval.isDueSoon
      };
    });

    // Post-filter by calculated SLA status if requested (supports single or multi-select e.g. "BREACHED,DUE_SOON")
    let filtered = evaluatedTickets;
    if (slaStatus && slaStatus !== 'ALL') {
      const slaList = (Array.isArray(slaStatus) ? slaStatus : String(slaStatus).split(','))
        .map(x => String(x).trim().toUpperCase())
        .filter(x => x && x !== 'ALL');
      if (slaList.length > 0) {
        filtered = evaluatedTickets.filter(t => slaList.includes(t.slaStatus));
      }
    }

    // Filter by stage read permissions for logged-in standard users
    if (req.user && req.user.role !== 'admin') {
      filtered = filtered.filter(t => hasStagePermission(req.user, t.current_stage_id, 'read'));
    }

    // Default sort by SLA in descending order (highest elapsed working days & breached first)
    const sortBy = req.query.sortBy || 'sla_desc';
    if (sortBy === 'sla_desc') {
      filtered.sort((a, b) => {
        const slaA = Number(a.slaElapsedWD) || 0;
        const slaB = Number(b.slaElapsedWD) || 0;
        if (slaB !== slaA) return slaB - slaA;
        if (b.isBreached !== a.isBreached) return b.isBreached ? 1 : -1;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
    } else if (sortBy === 'sla_asc') {
      filtered.sort((a, b) => {
        const slaA = Number(a.slaElapsedWD) || 0;
        const slaB = Number(b.slaElapsedWD) || 0;
        if (slaA !== slaB) return slaA - slaB;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
    } else if (sortBy === 'id_desc' || sortBy === 'newest') {
      filtered.sort((a, b) => {
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        if (timeB && timeA && timeB !== timeA) return timeB - timeA;

        const arrB = b.arrival_date ? new Date(b.arrival_date).getTime() : 0;
        const arrA = a.arrival_date ? new Date(a.arrival_date).getTime() : 0;
        if (arrB && arrA && arrB !== arrA) return arrB - arrA;

        const numB = parseInt(String(b.ticket_number || '').replace(/\D/g, ''), 10) || 0;
        const numA = parseInt(String(a.ticket_number || '').replace(/\D/g, ''), 10) || 0;
        if (numB !== numA) return numB - numA;

        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
    } else if (sortBy === 'id_asc' || sortBy === 'oldest') {
      filtered.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) return timeA - timeB;

        const arrA = a.arrival_date ? new Date(a.arrival_date).getTime() : 0;
        const arrB = b.arrival_date ? new Date(b.arrival_date).getTime() : 0;
        if (arrA && arrB && arrA !== arrB) return arrA - arrB;

        const numA = parseInt(String(a.ticket_number || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.ticket_number || '').replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;

        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
    } else if (sortBy === 'customer_asc') {
      filtered.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));
    } else if (sortBy === 'customer_desc') {
      filtered.sort((a, b) => (b.customer_name || '').localeCompare(a.customer_name || ''));
    } else if (sortBy === 'model_asc') {
      filtered.sort((a, b) => (a.model || a.vehicle_name || '').localeCompare(b.model || b.vehicle_name || ''));
    } else if (sortBy === 'stage_asc') {
      filtered.sort((a, b) => (Number(a.current_stage_id) || 0) - (Number(b.current_stage_id) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));
    } else if (sortBy === 'stage_desc') {
      filtered.sort((a, b) => (Number(b.current_stage_id) || 0) - (Number(a.current_stage_id) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));
    } else {
      filtered.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get ticket detail with full stage logs
 */
app.get('/api/tickets/:id', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get(`
      SELECT t.*,
        COALESCE(tp_stats.total_parts, 0) AS total_parts_count,
        COALESCE(tp_stats.insurance_approved_count, 0) AS insurance_approved_count,
        CASE WHEN t.current_stage_id > 5 THEN COALESCE(tp_stats.pca_count, 0) ELSE 0 END AS pca_count,
        CASE WHEN t.current_stage_id > 5 THEN COALESCE(tp_stats.ca_count, 0) ELSE 0 END AS ca_count,
        CASE WHEN t.current_stage_id >= 6 THEN COALESCE(tp_stats.pod_count, 0) ELSE 0 END AS pod_count,
        COALESCE(tp_stats.arrived_count, 0) AS arrived_parts_count
      FROM tickets t
      LEFT JOIN (
        SELECT ticket_id,
          COUNT(*) AS total_parts,
          SUM(CASE WHEN insurance_approved = 1 OR company_approved = 1 THEN 1 ELSE 0 END) AS insurance_approved_count,
          SUM(CASE WHEN UPPER(COALESCE(customer_approval_status, '')) = 'PENDING' THEN 1 ELSE 0 END) AS pca_count,
          SUM(CASE WHEN UPPER(COALESCE(customer_approval_status, '')) = 'APPROVED' THEN 1 ELSE 0 END) AS ca_count,
          SUM(CASE WHEN UPPER(COALESCE(part_status, '')) = 'ORDERED' THEN 1 ELSE 0 END) AS pod_count,
          SUM(CASE WHEN UPPER(COALESCE(part_status, '')) = 'ARRIVED' THEN 1 ELSE 0 END) AS arrived_count
        FROM ticket_parts
        GROUP BY ticket_id
      ) tp_stats ON tp_stats.ticket_id = t.id
      WHERE t.id = ?;
    `, [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Permission check for viewing this stage
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'read')) {
      return res.status(403).json({ error: `Permission denied: You do not have permission to view tickets in Stage ${ticket.current_stage_id}.` });
    }

    const stageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === ticket.current_stage_id);
    const isCompleted = ticket.status === 'CLOSED';
    const stageEval = slaEngine.evaluateStageSLA(
      ticket.current_stage_id,
      ticket.current_stage_entered_at,
      isCompleted ? ticket.closure_date : null,
      new Date()
    );

    const logs = await db.all(`
      SELECT * FROM stage_logs WHERE ticket_id = ? ORDER BY entered_at ASC;
    `, [ticket.id]);

    const parts = await db.getTicketParts(ticket.id);
    const partsStats = await db.getTicketPartsStats(ticket.id);

    res.json({
      ...ticket,
      stageName: stageConfig ? stageConfig.name : `Stage ${ticket.current_stage_id}`,
      stageDescription: stageConfig ? stageConfig.description : '',
      slaLimitWD: stageConfig ? stageConfig.slaLimitWD : null,
      slaElapsedWD: stageEval.elapsedWD,
      slaRemainingWD: stageEval.remainingWD,
      slaStatus: stageEval.status,
      slaBadge: stageEval.badge,
      isBreached: stageEval.isBreached,
      isDueSoon: stageEval.isDueSoon,
      logs,
      parts,
      partsStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get ticket parts breakdown
 */
app.get('/api/tickets/:id/parts', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'read')) {
      return res.status(403).json({ error: `Permission denied: You do not have permission to view parts for Stage ${ticket.current_stage_id}.` });
    }
    const parts = await db.getTicketParts(req.params.id);
    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Add a part item to ticket
 */
app.post('/api/tickets/:id/parts/add', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }
    const part = await db.addTicketPart(req.params.id, req.body);
    const parts = await db.getTicketParts(req.params.id);
    res.status(201).json({ success: true, part, parts });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update single part status (e.g. ARRIVED or ORDERED) and arrival timestamp
 */
app.post('/api/tickets/:id/parts/:partId/status', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }
    const { status, arrivedAt } = req.body;
    const updated = await db.updateTicketPartStatus(req.params.id, req.params.partId, status, arrivedAt);
    const parts = await db.getTicketParts(req.params.id);
    res.json({ success: true, part: updated, parts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Batch mark parts as arrived
 */
app.post('/api/tickets/:id/parts/batch-arrival', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }
    const { partIds } = req.body;
    const nowIso = new Date().toISOString();
    if (Array.isArray(partIds) && partIds.length > 0) {
      for (const pid of partIds) {
        await db.updateTicketPartStatus(req.params.id, pid, 'ARRIVED', nowIso);
      }
    } else {
      await db.markAllTicketPartsArrived(req.params.id);
    }
    const parts = await db.getTicketParts(req.params.id);
    res.json({ success: true, parts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a part item from ticket
 */
app.delete('/api/tickets/:id/parts/:partId', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }
    await db.deleteTicketPart(req.params.id, req.params.partId);
    const parts = await db.getTicketParts(req.params.id);
    res.json({ success: true, parts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get ticket parts approval status & breakdown
 */
app.get('/api/tickets/:id/parts-approval', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, ticket_number, customer_name, customer_phone, vehicle_no, model, current_stage_id, customer_approval_exempt FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const parts = await db.getTicketParts(req.params.id);
    const stats = await db.getTicketPartsStats(req.params.id);
    res.json({ success: true, ticket, parts, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update ticket parts approval statuses and exemptions
 */
app.post('/api/tickets/:id/parts-approval', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }

    const { parts, newParts, customerApprovalExempt } = req.body;

    if (Array.isArray(parts) && parts.length > 0) {
      for (const p of parts) {
        if (p && p.id) {
          await db.updateTicketPartApproval(ticket.id, p.id, p);
        }
      }
    }

    if (Array.isArray(newParts) && newParts.length > 0) {
      for (const np of newParts) {
        await db.addTicketPart(ticket.id, np);
      }
    }

    if (customerApprovalExempt !== undefined) {
      await db.setTicketCustomerApprovalExempt(ticket.id, customerApprovalExempt);
    }

    await db.refreshTicketPartsSummary(ticket.id);
    const updatedParts = await db.getTicketParts(ticket.id);
    const stats = await db.getTicketPartsStats(ticket.id);
    const updatedTicket = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticket.id]);

    res.json({ success: true, parts: updatedParts, stats, ticket: updatedTicket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bulk mark all pending customer parts as approved for this ticket
 */
app.post('/api/tickets/:id/parts-approval/bulk-customer-approve', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT id, current_stage_id FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }

    await db.run(`
      UPDATE ticket_parts
      SET customer_approval_status = 'APPROVED'
      WHERE ticket_id = ? AND UPPER(COALESCE(customer_approval_status, '')) = 'PENDING';
    `, [ticket.id]);

    const parts = await db.getTicketParts(ticket.id);
    const stats = await db.getTicketPartsStats(ticket.id);
    res.json({ success: true, parts, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Create new service ticket (Stage 1: Vehicle Arrival)
 */
// In-flight & Recent Ticket Creation Deduplication Cache (Prevents double-clicks & duplicate tickets)
const activeTicketCreations = new Map(); // key -> Promise
const recentTicketCreations = new Map(); // key -> { ticket, timestamp }

// Periodic cleanup of stale deduplication entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recentTicketCreations.entries()) {
    if (now - val.timestamp > 15000) {
      recentTicketCreations.delete(key);
    }
  }
}, 30000);

app.post('/api/tickets', optionalAuthenticate, async (req, res) => {
  try {
    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, 1, 'write')) {
      return res.status(403).json({ error: 'Permission denied: You do not have write permission for Stage 1 (Vehicle Arrival).' });
    }
    const outletId = req.body.branchId || req.body.outletId;
    const {
      customerName,
      customerPhone,
      vehicleNo,
      vehicleName,
      model,
      color,
      chassisNumber,
      arrivalDate
    } = req.body;

    if (!outletId) {
      return res.status(400).json({ error: 'Please select a branch.' });
    }
    const resolvedModel = (model || vehicleName || '').trim();
    const resolvedVehicleName = (vehicleName || resolvedModel || 'Honda Vehicle').trim();
    if (!customerName || !customerPhone || !resolvedVehicleName) {
      return res.status(400).json({ error: 'Customer Name, Phone, and Vehicle Model are required.' });
    }

    // Deduplication Key based on branch, customer phone, and vehicle identifier
    const vehIdKey = (vehicleNo || chassisNumber || resolvedModel).trim().toUpperCase();
    const dedupKey = `${outletId}_${customerPhone.trim()}_${vehIdKey}`;

    // If identical ticket was created within last 10 seconds, return it immediately
    if (recentTicketCreations.has(dedupKey)) {
      const cached = recentTicketCreations.get(dedupKey);
      if (Date.now() - cached.timestamp < 10000) {
        console.log(`[DEDUP] Returning recently created ticket for key: ${dedupKey}`);
        return res.status(200).json(cached.ticket);
      }
    }

    // If an identical ticket creation is currently in-flight, await its Promise
    if (activeTicketCreations.has(dedupKey)) {
      console.log(`[DEDUP] Awaiting in-flight ticket creation for key: ${dedupKey}`);
      const inFlightTicket = await activeTicketCreations.get(dedupKey);
      return res.status(200).json(inFlightTicket);
    }

    // Create execution promise and register in active map
    const creationPromise = (async () => {
      const currentYear = new Date().getFullYear();
      const prefix = `TCK-${currentYear}-`;

      // Run branch check, customer sync, and ticket count concurrently
      const [outlet, customerId, rows] = await Promise.all([
        db.get('SELECT * FROM outlets WHERE id = ?;', [outletId]),
        db.syncCustomerAndVehicle({
          customerName,
          customerPhone,
          vehicleNo,
          vehicleName: resolvedVehicleName,
          model: resolvedModel,
          color,
          chassisNumber
        }),
        db.all(`SELECT ticket_number FROM tickets WHERE ticket_number LIKE ?;`, [`${prefix}%`])
      ]);

      if (!outlet) {
        throw new Error('Invalid branch selected.');
      }

      // Compute monotonic ticket number
      let maxNum = 0;
      for (const r of rows) {
        if (r.ticket_number) {
          const parts = r.ticket_number.split('-');
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxNum) {
            maxNum = seq;
          }
        }
      }
      const ticketNumber = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
      const nowIso = arrivalDate ? new Date(arrivalDate).toISOString() : new Date().toISOString();

      const insertResult = await db.run(`
        INSERT INTO tickets (
          ticket_number, outlet_id, outlet_name, customer_id, customer_name,
          customer_phone, vehicle_no, vehicle_name, model, color, chassis_number,
          current_stage_id, status, arrival_date, current_stage_entered_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          1, 'OPEN', ?, ?
        );
      `, [
        ticketNumber, outlet.id, outlet.name, customerId || null, customerName.trim(),
        customerPhone.trim(), vehicleNo ? vehicleNo.trim().toUpperCase() : null,
        resolvedVehicleName, resolvedModel || null, color ? color.trim() : null,
        (chassisNumber && chassisNumber.trim()) ? chassisNumber.trim().toUpperCase() : '', nowIso, nowIso
      ]);

      const newTicketId = insertResult.lastID;

      // Log Stage 1 entry
      await db.run(`
        INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, sla_status)
        VALUES (?, 1, 'Vehicle Arrival', ?, 'WITHIN_SLA');
      `, [newTicketId, nowIso]);

      const created = await db.get('SELECT * FROM tickets WHERE id = ?;', [newTicketId]);
      return created;
    })();

    activeTicketCreations.set(dedupKey, creationPromise);

    let createdTicket;
    try {
      createdTicket = await creationPromise;
      recentTicketCreations.set(dedupKey, { ticket: createdTicket, timestamp: Date.now() });
    } finally {
      activeTicketCreations.delete(dedupKey);
    }

    res.status(201).json(createdTicket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update general ticket fields (re-editable data entry)
 */
app.put('/api/tickets/:id', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      vehicleNo,
      vehicleName,
      model,
      color,
      chassisNumber,
      estimatedCost,
      damagedParts,
      insuranceCompany,
      surveyorName,
      surveyorPhone,
      syncCrm,
      parts,
      partsStatusNote
    } = req.body;

    const resolvedModel = model !== undefined ? (model?.trim() || null) : undefined;
    const resolvedVehicleName = vehicleName !== undefined ? (vehicleName?.trim() || null) : resolvedModel;

    let resolvedEstimatedCost = estimatedCost;
    let resolvedDamagedParts = damagedParts;

    if (Array.isArray(parts)) {
      const savedPartsResult = await db.saveTicketParts(req.params.id, parts);
      if (resolvedEstimatedCost === undefined || resolvedEstimatedCost === null || Number(resolvedEstimatedCost) === 0) {
        resolvedEstimatedCost = savedPartsResult.totalCost;
      }
      if (!resolvedDamagedParts && savedPartsResult.summary) {
        resolvedDamagedParts = savedPartsResult.summary;
      }
    }

    await db.run(`
      UPDATE tickets SET
        customer_name = COALESCE(?, customer_name),
        customer_phone = COALESCE(?, customer_phone),
        vehicle_no = COALESCE(?, vehicle_no),
        vehicle_name = COALESCE(?, vehicle_name),
        model = COALESCE(?, model),
        color = COALESCE(?, color),
        chassis_number = COALESCE(?, chassis_number),
        estimated_cost = COALESCE(?, estimated_cost),
        damaged_parts = COALESCE(?, damaged_parts),
        insurance_company = COALESCE(?, insurance_company),
        surveyor_name = COALESCE(?, surveyor_name),
        surveyor_phone = COALESCE(?, surveyor_phone),
        parts_status_note = COALESCE(?, parts_status_note),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `, [
      customerName, customerPhone, vehicleNo, resolvedVehicleName, resolvedModel, color, chassisNumber,
      resolvedEstimatedCost, resolvedDamagedParts, insuranceCompany, surveyorName, surveyorPhone,
      partsStatusNote !== undefined ? partsStatusNote : null,
      req.params.id
    ]);

    // Background CRM sync (only if explicitly enabled or not disabled)
    if (syncCrm !== false) {
      if (customerName && customerPhone) {
        db.syncCustomerAndVehicle({
          customerName,
          customerPhone,
          vehicleNo,
          vehicleName: resolvedVehicleName,
          model: resolvedModel,
          color,
          chassisNumber
        }).catch(() => {});
      }
      if (insuranceCompany || surveyorName) {
        db.syncInsurerAndSurveyor(insuranceCompany, surveyorName, surveyorPhone).catch(() => {});
      }
    }

    const updated = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Quick Parts Status / Delay Note (e.g. "Sent to paint job", "Vendor transit delay")
 */
app.post('/api/tickets/:id/parts-note', async (req, res) => {
  try {
    const { note } = req.body;
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const trimmedNote = (note !== undefined && note !== null) ? String(note).trim() : null;

    await db.run(`
      UPDATE tickets
      SET parts_status_note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `, [trimmedNote || null, req.params.id]);

    const updated = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a ticket and its associated records
 */
app.delete('/api/tickets/:id', optionalAuthenticate, async (req, res) => {
  try {
    const ticketId = req.params.id;
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticketId]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'delete')) {
      return res.status(403).json({ error: `Permission denied: You do not have delete permission for Stage ${ticket.current_stage_id}.` });
    }

    // Clean up stage logs and SLA alerts, then delete ticket
    await db.run('DELETE FROM stage_logs WHERE ticket_id = ?;', [ticketId]);
    await db.run('DELETE FROM sla_alerts WHERE ticket_id = ?;', [ticketId]);
    await db.run('DELETE FROM tickets WHERE id = ?;', [ticketId]);

    res.json({ success: true, message: `Ticket ${ticket.ticket_number} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TICKET COMMENTS & THREADED NOTES ENDPOINTS
// ==========================================

/**
 * List comments & threaded replies for a ticket
 */
app.get('/api/tickets/:id/comments', optionalAuthenticate, async (req, res) => {
  try {
    const comments = await db.all(`
      SELECT 
        c.id, c.ticket_id, c.parent_id, c.user_id, c.user_name, c.user_role,
        c.content, c.mentions, c.created_at, c.updated_at
      FROM ticket_comments c
      WHERE c.ticket_id = ?
      ORDER BY c.created_at ASC;
    `, [req.params.id]);

    res.json(comments || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Post a new note/comment or reply to an existing note
 */
app.post('/api/tickets/:id/comments', optionalAuthenticate, async (req, res) => {
  try {
    const { content, parentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty.' });
    }

    const ticket = await db.get('SELECT id, ticket_number FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const user = req.user || { id: null, display_name: 'Staff Member', username: 'staff', role: 'Staff' };
    const authorName = user.display_name || user.username || 'Staff Member';
    const authorRole = user.role || 'Advisor';
    const authorId = user.id || null;

    // Extract @mentions
    const mentionMatches = content.match(/@([a-zA-Z0-9_\-]+)/g) || [];
    const mentions = Array.from(new Set(mentionMatches.map(m => m.substring(1).toLowerCase())));

    const insertRes = await db.run(`
      INSERT INTO ticket_comments (ticket_id, parent_id, user_id, user_name, user_role, content, mentions)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `, [
      ticket.id,
      parentId ? Number(parentId) : null,
      authorId,
      authorName,
      authorRole,
      content.trim(),
      mentions
    ]);

    const commentId = insertRes.lastID;
    const newComment = await db.get('SELECT * FROM ticket_comments WHERE id = ?;', [commentId]);

    // Dispatch notifications:
    // 1. If it is a reply, notify the parent note's author
    if (parentId) {
      const parentComment = await db.get('SELECT id, user_id, user_name FROM ticket_comments WHERE id = ?;', [parentId]);
      if (parentComment && parentComment.user_id && parentComment.user_id !== authorId) {
        await db.run(`
          INSERT INTO user_notifications (user_id, actor_id, actor_name, type, ticket_id, ticket_number, comment_id, content_snippet)
          VALUES (?, ?, ?, 'REPLY', ?, ?, ?, ?);
        `, [
          parentComment.user_id,
          authorId,
          authorName,
          ticket.id,
          ticket.ticket_number,
          commentId,
          content.trim().slice(0, 120)
        ]);
      }
    }

    // 2. Notify mentioned users
    for (const uname of mentions) {
      const targetUser = await db.getUserByUsername(uname);
      if (targetUser && targetUser.id !== authorId) {
        await db.run(`
          INSERT INTO user_notifications (user_id, actor_id, actor_name, type, ticket_id, ticket_number, comment_id, content_snippet)
          VALUES (?, ?, ?, 'MENTION', ?, ?, ?, ?);
        `, [
          targetUser.id,
          authorId,
          authorName,
          ticket.id,
          ticket.ticket_number,
          commentId,
          content.trim().slice(0, 120)
        ]);
      }
    }

    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a comment/note
 */
app.delete('/api/tickets/:id/comments/:commentId', optionalAuthenticate, async (req, res) => {
  try {
    const comment = await db.get('SELECT * FROM ticket_comments WHERE id = ? AND ticket_id = ?;', [req.params.commentId, req.params.id]);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (req.user && req.user.role !== 'admin' && req.user.id !== comment.user_id) {
      return res.status(403).json({ error: 'Permission denied to delete this comment.' });
    }

    await db.run('DELETE FROM user_notifications WHERE comment_id = ?;', [comment.id]);
    await db.run('DELETE FROM ticket_comments WHERE id = ? OR parent_id = ?;', [comment.id, comment.id]);

    res.json({ success: true, message: 'Comment deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// USER NOTIFICATIONS & MENTIONS ENDPOINTS
// ==========================================

/**
 * Get notifications (mentions, replies) for current user
 */
app.get('/api/notifications', optionalAuthenticate, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    let query = `
      SELECT n.*, t.vehicle_no, t.model, t.customer_name
      FROM user_notifications n
      LEFT JOIN tickets t ON n.ticket_id = t.id
    `;
    const params = [];
    if (userId) {
      query += ` WHERE n.user_id = ?`;
      params.push(userId);
    }
    query += ` ORDER BY n.created_at DESC LIMIT 50;`;

    const notifications = await db.all(query, params);

    let unreadQuery = `SELECT COUNT(*) as count FROM user_notifications WHERE is_read = false`;
    const countParams = [];
    if (userId) {
      unreadQuery += ` AND user_id = ?`;
      countParams.push(userId);
    }
    const unreadRes = await db.get(unreadQuery, countParams);

    res.json({
      notifications: notifications || [],
      unreadCount: Number(unreadRes?.count) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mark single notification as read
 */
app.patch('/api/notifications/:id/read', optionalAuthenticate, async (req, res) => {
  try {
    await db.run('UPDATE user_notifications SET is_read = true WHERE id = ?;', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Mark all notifications as read
 */
app.post('/api/notifications/read-all', optionalAuthenticate, async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    if (userId) {
      await db.run('UPDATE user_notifications SET is_read = true WHERE user_id = ?;', [userId]);
    } else {
      await db.run('UPDATE user_notifications SET is_read = true;');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Advance ticket to next stage with stage-specific inputs
 */
app.post('/api/tickets/:id/advance', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ error: 'Ticket is already closed.' });
    }

    const {
      targetStageId,
      damagedParts,
      estimatedCost,
      insuranceCompany,
      surveyorName,
      surveyorPhone,
      partsOrderRequired,
      resurveyRequired,
      notes,
      parts,
      partsStatusNote,
      partsApproval,
      customerApprovalExempt
    } = req.body;

    if (req.user && req.user.role !== 'admin') {
      if (!hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
        return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
      }
      if (targetStageId && !hasStagePermission(req.user, targetStageId, 'write')) {
        return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${targetStageId}.` });
      }
    }

    const partsReq = partsOrderRequired !== undefined ? (partsOrderRequired ? 1 : 0) : ticket.parts_order_required;
    const resurvReq = resurveyRequired !== undefined ? (resurveyRequired ? 1 : 0) : ticket.resurvey_required;

    // Determine target stage
    const nextStageId = targetStageId || slaEngine.getNextStageId(ticket.current_stage_id, partsReq, resurvReq);
    const targetStageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === nextStageId);
    if (!targetStageConfig) {
      return res.status(400).json({ error: 'Invalid target stage.' });
    }

    // Enforce parts arrival validation when moving to Stage 7 (Parts Arrival)
    if (nextStageId === 7) {
      const { arrivedPartIds } = req.body;
      const nowIsoStamp = new Date().toISOString();

      // If user selected parts in checklist, mark them arrived
      if (Array.isArray(arrivedPartIds) && arrivedPartIds.length > 0) {
        for (const pId of arrivedPartIds) {
          await db.updateTicketPartStatus(ticket.id, pId, 'ARRIVED', nowIsoStamp);
        }
      }

      // Verify all parts for this ticket are arrived
      const currentParts = await db.getTicketParts(ticket.id);
      if (currentParts.length > 0) {
        const unarrivedParts = currentParts.filter(p => (p.part_status || '').toUpperCase() === 'ORDERED');
        if (unarrivedParts.length > 0) {
          const names = unarrivedParts.map(p => p.part_name).join(', ');
          return res.status(400).json({
            error: `All ordered parts must be ticked as arrived before proceeding to Parts Arrival. (${unarrivedParts.length} pending: ${names})`
          });
        }
      }
    }

    // Handle parts approval checklist updates if submitted during advance (e.g. Stage 5 Approval)
    if (Array.isArray(partsApproval) && partsApproval.length > 0) {
      for (const p of partsApproval) {
        if (p && p.id) {
          await db.updateTicketPartApproval(ticket.id, p.id, p);
        }
      }
      await db.refreshTicketPartsSummary(ticket.id);
    }

    const nowIso = new Date().toISOString();

    // Close previous stage log
    const prevElapsedWD = slaEngine.calculateWorkingDays(ticket.current_stage_entered_at, nowIso);
    const prevStageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === ticket.current_stage_id);
    const prevSlaLimit = prevStageConfig ? prevStageConfig.slaLimitWD : null;
    const prevStatus = prevSlaLimit !== null && prevElapsedWD > prevSlaLimit ? 'BREACHED' : 'COMPLETED';

    await db.run(`
      UPDATE stage_logs
      SET completed_at = ?,
          elapsed_wd = ?,
          sla_limit_wd = ?,
          sla_status = ?
      WHERE ticket_id = ? AND stage_id = ? AND completed_at IS NULL;
    `, [nowIso, prevElapsedWD, prevSlaLimit, prevStatus, ticket.id, ticket.current_stage_id]);

    // Determine new Kanban Column status from stage config
    let newColumnStatus = targetStageConfig.kanbanColumn || (nextStageId === 1 ? 'OPEN' : (nextStageId === 13 ? 'CLOSED' : 'IN_PROGRESS'));

    // Dynamic field assignments based on transition
    let updateFields = [];
    let updateParams = [];

    let resolvedDamagedParts = damagedParts;
    let resolvedEstimatedCost = estimatedCost;

    if (Array.isArray(parts) && parts.length > 0) {
      const savedPartsResult = await db.saveTicketParts(ticket.id, parts);
      if (resolvedEstimatedCost === undefined || resolvedEstimatedCost === null || Number(resolvedEstimatedCost) === 0) {
        resolvedEstimatedCost = savedPartsResult.totalCost;
      }
      if (!resolvedDamagedParts) {
        resolvedDamagedParts = savedPartsResult.summary;
      }
    }

    if (customerApprovalExempt !== undefined) {
      const exemptVal = customerApprovalExempt ? 1 : 0;
      await db.setTicketCustomerApprovalExempt(ticket.id, exemptVal);
      updateFields.push('customer_approval_exempt = ?');
      updateParams.push(exemptVal);
    }

    if (resolvedDamagedParts) {
      updateFields.push('damaged_parts = ?');
      updateParams.push(resolvedDamagedParts);
      db.syncPart(resolvedDamagedParts, resolvedEstimatedCost).catch(() => {});
    }
    if (resolvedEstimatedCost !== undefined && resolvedEstimatedCost !== null) {
      updateFields.push('estimated_cost = ?');
      updateParams.push(resolvedEstimatedCost);
    }
    if (partsStatusNote !== undefined) {
      updateFields.push('parts_status_note = ?');
      updateParams.push(partsStatusNote ? String(partsStatusNote).trim() : null);
    }
    if (insuranceCompany) {
      updateFields.push('insurance_company = ?');
      updateParams.push(insuranceCompany);
    }
    if (surveyorName) {
      updateFields.push('surveyor_name = ?');
      updateParams.push(surveyorName);
    }
    if (surveyorPhone) {
      updateFields.push('surveyor_phone = ?');
      updateParams.push(surveyorPhone);
    }
    if (insuranceCompany || surveyorName) {
      db.syncInsurerAndSurveyor(insuranceCompany, surveyorName, surveyorPhone).catch(() => {});
    }

    // Update flags
    updateFields.push('parts_order_required = ?');
    updateParams.push(partsReq);
    updateFields.push('resurvey_required = ?');
    updateParams.push(resurvReq);

    // Record stage dates
    if (nextStageId === 2) updateFields.push('estimate_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 3) updateFields.push('insurance_intimation_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 4) updateFields.push('survey_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 5) updateFields.push('approval_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 6) updateFields.push('parts_order_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 7) updateFields.push('parts_arrival_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 8) updateFields.push('work_start_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 9) updateFields.push('work_complete_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 10) updateFields.push('invoice_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 11) updateFields.push('resurvey_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 12) updateFields.push('waiting_delivery_date = ?'), updateParams.push(nowIso);
    if (nextStageId === 13) {
      updateFields.push('delivery_date = ?');
      updateParams.push(nowIso);
      updateFields.push('closure_date = ?');
      updateParams.push(nowIso);
    }

    updateFields.push('current_stage_id = ?');
    updateParams.push(nextStageId);
    updateFields.push('status = ?');
    updateParams.push(newColumnStatus);
    updateFields.push('current_stage_entered_at = ?');
    updateParams.push(nowIso);
    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    updateParams.push(ticket.id);

    await db.run(`
      UPDATE tickets SET ${updateFields.join(', ')} WHERE id = ?;
    `, updateParams);

    // If skipping forward across multiple stages (e.g. optional parts stages 6-7 or resurvey 11),
    // mark all intermediate bypassed stages as SKIPPED in stage_logs
    if (nextStageId > ticket.current_stage_id + 1) {
      for (let s = ticket.current_stage_id + 1; s < nextStageId; s++) {
        const stCfg = slaEngine.STAGE_CONFIG.find(st => st.id === s);
        await db.run(`
          INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, completed_at, sla_limit_wd, elapsed_wd, sla_status, data_json)
          VALUES (?, ?, ?, ?, ?, ?, 0, 'SKIPPED', ?);
        `, [
          ticket.id,
          s,
          stCfg ? stCfg.name : `Stage #${s}`,
          nowIso,
          nowIso,
          stCfg ? (stCfg.slaLimitWD || 0) : 0,
          JSON.stringify({ skipped: true, reason: 'Optional/bypassed stage in pipeline transition' })
        ]);
      }
    }

    // Prepare stage log metadata
    let logData = { notes };
    if (nextStageId === 7) {
      const arrivedParts = await db.getTicketParts(ticket.id);
      if (arrivedParts.length > 0) {
        logData.partsArrival = arrivedParts.map(p => ({
          id: p.id,
          part_name: p.part_name,
          part_code: p.part_code,
          quantity: p.quantity,
          part_status: p.part_status,
          arrived_at: p.arrived_at || nowIso
        }));
      }
    }

    // Insert new stage log
    await db.run(`
      INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, sla_status, data_json)
      VALUES (?, ?, ?, ?, 'WITHIN_SLA', ?);
    `, [ticket.id, nextStageId, targetStageConfig.name, nowIso, JSON.stringify(logData)]);

    const updatedTicket = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticket.id]);
    res.json(updatedTicket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Pipeline Bypass & Early Close
 * Used when customer pays directly before insurance and picks up vehicle (e.g. at Stage 9 Work Complete)
 */
app.post('/api/tickets/:id/bypass', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${ticket.current_stage_id}.` });
    }

    const { reason, notes, confirmText } = req.body;
    if (!confirmText || confirmText.trim().toUpperCase() !== 'CONFIRM') {
      return res.status(400).json({ error: 'Confirmation required. Must type CONFIRM to bypass pipeline.' });
    }
    const nowIso = new Date().toISOString();
    const bypassReasonText = reason || 'Customer direct payment prior to insurance settlement; vehicle picked up.';

    // Close current stage log
    const prevElapsedWD = slaEngine.calculateWorkingDays(ticket.current_stage_entered_at, nowIso);
    await db.run(`
      UPDATE stage_logs
      SET completed_at = ?,
          elapsed_wd = ?,
          sla_status = 'COMPLETED'
      WHERE ticket_id = ? AND stage_id = ? AND completed_at IS NULL;
    `, [nowIso, prevElapsedWD, ticket.id, ticket.current_stage_id]);

    // Mark ticket as bypassed and close it at Stage 12 (Customer Delivery)
    await db.run(`
      UPDATE tickets SET
        is_bypassed = 1,
        bypass_stage_id = ?,
        bypass_reason = ?,
        bypassed_at = ?,
        current_stage_id = 13,
        status = 'CLOSED',
        delivery_date = ?,
        closure_date = ?,
        current_stage_entered_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?;
    `, [
      ticket.current_stage_id,
      bypassReasonText,
      nowIso,
      nowIso,
      nowIso,
      nowIso,
      ticket.id
    ]);

    // Insert audit log for bypass
    await db.run(`
      INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, completed_at, sla_status, data_json)
      VALUES (?, 12, 'Customer Delivery (Bypassed)', ?, ?, 'COMPLETED', ?);
    `, [ticket.id, nowIso, nowIso, JSON.stringify({ isBypassed: true, reason: bypassReasonText, notes })]);

    const updated = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticket.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Rollback Ticket to a previous stage (Move Backwards)
 * Permanently erases all stage logs and clears date fields for stages after targetStageId
 */
app.post('/api/tickets/:id/rollback', optionalAuthenticate, async (req, res) => {
  try {
    const { targetStageId, confirmText } = req.body;
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    if (req.user && req.user.role !== 'admin' && !hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
      return res.status(403).json({ error: `Permission denied: You do not have permission to rollback Stage ${ticket.current_stage_id}.` });
    }

    const targetStageNum = parseInt(targetStageId, 10);
    if (isNaN(targetStageNum) || targetStageNum < 1 || targetStageNum >= ticket.current_stage_id) {
      return res.status(400).json({ error: 'Target stage must be less than current stage' });
    }

    if (!confirmText || confirmText.trim().toUpperCase() !== 'CONFIRM') {
      return res.status(400).json({ error: 'Confirmation required. Must type CONFIRM to rollback stage.' });
    }

    const nowIso = new Date().toISOString();

    // Erase all stage logs after targetStageNum
    await db.run('DELETE FROM stage_logs WHERE ticket_id = ? AND stage_id > ?;', [ticket.id, targetStageNum]);

    // Update the stage log for targetStageNum so that completed_at is NULL (it becomes active again)
    await db.run(`
      UPDATE stage_logs
      SET completed_at = NULL,
          elapsed_wd = 0,
          sla_status = 'WITHIN_SLA'
      WHERE ticket_id = ? AND stage_id = ?;
    `, [ticket.id, targetStageNum]);

    // Build fields to reset in tickets table
    const dateFieldMap = {
      2: ['estimate_date'],
      3: ['insurance_intimation_date'],
      4: ['survey_date'],
      5: ['approval_date'],
      6: ['parts_order_date'],
      7: ['parts_arrival_date'],
      8: ['work_start_date'],
      9: ['work_complete_date'],
      10: ['invoice_date'],
      11: ['resurvey_date'],
      12: ['delivery_date', 'closure_date']
    };

    let resetFields = [];
    for (let s = targetStageNum + 1; s <= 12; s++) {
      if (dateFieldMap[s]) {
        dateFieldMap[s].forEach(f => resetFields.push(`${f} = NULL`));
      }
    }

    let newColumnStatus = targetStageNum === 1 ? 'OPEN' : 'IN_PROGRESS';
    let updateSql = `
      UPDATE tickets
      SET current_stage_id = ?,
          status = ?,
          current_stage_entered_at = ?,
          is_bypassed = 0,
          updated_at = CURRENT_TIMESTAMP
          ${resetFields.length > 0 ? ', ' + resetFields.join(', ') : ''}
      WHERE id = ?;
    `;

    await db.run(updateSql, [targetStageNum, newColumnStatus, nowIso, ticket.id]);

    const updated = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticket.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Skip forward across multiple stages (e.g. Stage 3 directly to Stage 8)
 * Marks intermediate stages as SKIPPED in stage_logs
 */
app.post('/api/tickets/:id/skip-to-stage', optionalAuthenticate, async (req, res) => {
  try {
    const { targetStageId, reason } = req.body;
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ?;', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const targetStageNum = parseInt(targetStageId, 10);
    if (isNaN(targetStageNum) || targetStageNum <= ticket.current_stage_id || targetStageNum > 12) {
      return res.status(400).json({ error: 'Target stage must be greater than current stage and <= 12' });
    }

    if (req.user && req.user.role !== 'admin') {
      if (!hasStagePermission(req.user, ticket.current_stage_id, 'write')) {
        return res.status(403).json({ error: `Permission denied: You do not have permission to move from Stage ${ticket.current_stage_id}.` });
      }
      if (!hasStagePermission(req.user, targetStageNum, 'write')) {
        return res.status(403).json({ error: `Permission denied: You do not have write permission for Stage ${targetStageNum}.` });
      }
    }

    const nowIso = new Date().toISOString();

    // 1. Close current stage log
    await db.run(`
      UPDATE stage_logs
      SET completed_at = ?,
          sla_status = 'COMPLETED'
      WHERE ticket_id = ? AND stage_id = ? AND completed_at IS NULL;
    `, [nowIso, ticket.id, ticket.current_stage_id]);

    // 2. Mark intermediate skipped stages
    for (let s = ticket.current_stage_id + 1; s < targetStageNum; s++) {
      const stConfig = slaEngine.STAGES[s];
      await db.run(`
        INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, completed_at, sla_limit_wd, elapsed_wd, sla_status, data_json)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'SKIPPED', ?);
      `, [ticket.id, s, stConfig ? stConfig.name : `Stage #${s}`, nowIso, nowIso, stConfig ? (stConfig.slaLimitWD || 0) : 0, JSON.stringify({ skipped: true, reason: reason || 'Skipped via pipeline' })]);
    }

    // 3. Enter target stage
    const targetStageConfig = slaEngine.STAGES[targetStageNum];
    await db.run(`
      INSERT INTO stage_logs (ticket_id, stage_id, stage_name, entered_at, sla_status, data_json)
      VALUES (?, ?, ?, ?, 'WITHIN_SLA', ?);
    `, [ticket.id, targetStageNum, targetStageConfig.name, nowIso, JSON.stringify({ notes: reason || 'Entered via pipeline drag' })]);

    let newColumnStatus = targetStageNum === 12 ? 'CLOSED' : 'IN_PROGRESS';
    let updateFields = [
      'current_stage_id = ?',
      'status = ?',
      'current_stage_entered_at = ?',
      'updated_at = CURRENT_TIMESTAMP'
    ];
    let updateParams = [targetStageNum, newColumnStatus, nowIso];

    if (targetStageNum === 12) {
      updateFields.push('delivery_date = ?', 'closure_date = ?');
      updateParams.push(nowIso, nowIso);
    }
    updateParams.push(ticket.id);

    await db.run(`UPDATE tickets SET ${updateFields.join(', ')} WHERE id = ?;`, updateParams);

    const updated = await db.get('SELECT * FROM tickets WHERE id = ?;', [ticket.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ALERTING & EOD MANAGER REPORT ENDPOINTS
// ==========================================

/**
 * Get current breach summary across all outlets
 */
app.get('/api/alerts/summary', async (req, res) => {
  try {
    const summary = await alertService.getBreachedTicketsSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Preview Google Apps Script webhook payload
 */
app.get('/api/alerts/eod-payload', async (req, res) => {
  try {
    const scope = req.query.scope || 'all';
    const payload = await alertService.generateGasWebhookPayload(scope);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Placeholder for manual End-of-Day report dispatch
 * (Per user instruction: "dont implement this but put a placeholder and write a todo.txt")
 */
app.post('/api/alerts/send-eod-report', async (req, res) => {
  try {
    const scope = req.body.scope || req.query.scope || 'all';
    const payload = await alertService.generateGasWebhookPayload(scope);
    const config = alertService.getAlertConfig();

    console.log(`[EOD Alert Placeholder - Scope: ${scope}] Generated report for managers:`);
    console.log(`- Breaches count: ${payload.metrics.totalBreached}`);
    console.log(`- Recipient emails: ${payload.recipients.join(', ') || 'None configured'}`);

    res.json({
      success: true,
      mode: 'PLACEHOLDER_SIMULATION',
      scope,
      message: `End-of-Day breach summary (${scope.toUpperCase()}) prepared. Email push will be activated when Google Apps Script Web App is connected (see todo.txt).`,
      payloadPreview: payload
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DIRECTORY & SETTINGS ENDPOINTS
// ==========================================

// Customers Directory
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await db.all(`
      SELECT 
        c.id, c.name, c.primary_phone, c.branch_id, c.notes, c.created_at,
        o.name as branch_name, o.code as branch_code,
        (SELECT STRING_AGG(phone, ', ') FROM customer_phones WHERE customer_id = c.id) AS alt_phones,
        (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE customer_id = c.id AND status != 'CLOSED') AS active_tickets
      FROM customers c
      LEFT JOIN outlets o ON c.branch_id = o.id
      ORDER BY c.name ASC;
    `);

    const customerBranches = await db.all(`
      SELECT cb.customer_id, cb.outlet_id, o.name as branch_name, o.code as branch_code
      FROM customer_branches cb
      JOIN outlets o ON cb.outlet_id = o.id
      ORDER BY o.name ASC;
    `);

    const branchesByCust = {};
    for (const cb of customerBranches) {
      if (!branchesByCust[cb.customer_id]) branchesByCust[cb.customer_id] = [];
      branchesByCust[cb.customer_id].push({
        id: cb.outlet_id,
        name: cb.branch_name,
        code: cb.branch_code
      });
    }

    const vehicles = await db.all(`
      SELECT id, customer_id, vehicle_name, model, color, vehicle_no, chassis_no
      FROM vehicles
      ORDER BY id ASC;
    `);

    const vehByCust = {};
    for (const v of vehicles) {
      if (!vehByCust[v.customer_id]) vehByCust[v.customer_id] = [];
      vehByCust[v.customer_id].push(v);
    }

    const result = customers.map(c => {
      const custBranches = branchesByCust[c.id] && branchesByCust[c.id].length > 0 
        ? branchesByCust[c.id] 
        : (c.branch_id ? [{ id: c.branch_id, name: c.branch_name, code: c.branch_code }] : []);

      return {
        ...c,
        branches: custBranches,
        vehicles: vehByCust[c.id] || []
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Customer Dossier: Profile, Vehicles & Full Service Ticket History
app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await db.get(`
      SELECT c.*, o.name as branch_name, o.code as branch_code,
        (SELECT STRING_AGG(phone, ', ') FROM customer_phones WHERE customer_id = c.id) AS alt_phones
      FROM customers c
      LEFT JOIN outlets o ON c.branch_id = o.id
      WHERE c.id = ?;
    `, [req.params.id]);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const branches = await db.all(`
      SELECT cb.outlet_id as id, o.name, o.code, o.location
      FROM customer_branches cb
      JOIN outlets o ON cb.outlet_id = o.id
      WHERE cb.customer_id = ?
      ORDER BY o.name ASC;
    `, [customer.id]);

    const vehicles = await db.all(`
      SELECT * FROM vehicles WHERE customer_id = ? ORDER BY id ASC;
    `, [customer.id]);

    const rawTickets = await db.all(`
      SELECT t.id, t.ticket_number, t.current_stage_id, t.status, t.created_at, t.updated_at,
             t.estimated_cost, t.insurance_company, t.surveyor_name, t.vehicle_no, t.model, t.color,
             o.name as branch_name, o.code as branch_code
      FROM tickets t
      LEFT JOIN outlets o ON t.outlet_id = o.id
      WHERE t.customer_id = ?
      ORDER BY t.id DESC;
    `, [customer.id]);

    const stageMap = Object.fromEntries(slaEngine.STAGE_CONFIG.map(s => [s.id, s.name]));
    const tickets = rawTickets.map(t => ({
      ...t,
      stage_name: stageMap[t.current_stage_id] || ('Stage #' + t.current_stage_id)
    }));

    res.json({
      ...customer,
      branches: branches.length > 0 ? branches : (customer.branch_id ? [{ id: customer.branch_id, name: customer.branch_name, code: customer.branch_code }] : []),
      vehicles,
      tickets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register New Customer (with optional multiple branch tags and notes)
app.post('/api/customers', async (req, res) => {
  try {
    const { name, primaryPhone, altPhones, branchId, branchIds, notes, vehicleName, model, color, vehicleNo, chassisNo } = req.body;
    if (!name || !primaryPhone) {
      return res.status(400).json({ error: 'Name and Primary Phone are required' });
    }

    const bIds = Array.isArray(branchIds) 
      ? branchIds.map(Number).filter(Boolean)
      : (branchIds ? String(branchIds).split(',').map(Number).filter(Boolean) : (branchId ? [parseInt(branchId)] : []));

    const primaryBranchId = bIds.length > 0 ? bIds[0] : (branchId ? parseInt(branchId) : null);

    const custResult = await db.run(`
      INSERT INTO customers (name, primary_phone, branch_id, notes) VALUES (?, ?, ?, ?);
    `, [name.trim(), primaryPhone.trim(), primaryBranchId, notes ? notes.trim() : null]);

    const customerId = custResult.lastID;

    // Insert into customer_branches for multiple branches
    for (const bId of bIds) {
      await db.run(`INSERT OR IGNORE INTO customer_branches (customer_id, outlet_id) VALUES (?, ?);`, [customerId, bId]);
    }

    if (altPhones && altPhones.trim()) {
      const phones = altPhones.split(',').map(p => p.trim()).filter(Boolean);
      for (const phone of phones) {
        await db.run(`INSERT OR IGNORE INTO customer_phones (customer_id, phone) VALUES (?, ?);`, [customerId, phone]);
      }
    }

    if (vehicleName || model || vehicleNo || chassisNo) {
      const vNo = (vehicleNo || '').trim().toUpperCase() || null;
      const cNo = (chassisNo || '').trim().toUpperCase() || null;
      if (vNo) {
        await db.run(`
          INSERT INTO vehicles (customer_id, vehicle_name, model, color, vehicle_no, chassis_no)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(vehicle_no) DO UPDATE SET
            customer_id = excluded.customer_id,
            vehicle_name = excluded.vehicle_name,
            model = excluded.model,
            color = excluded.color,
            chassis_no = COALESCE(excluded.chassis_no, vehicles.chassis_no);
        `, [
          customerId,
          (vehicleName || model || 'Honda Motorcycle').trim(),
          (model || vehicleName || '').trim(),
          (color || '').trim(),
          vNo,
          cNo
        ]);
      } else {
        await db.run(`
          INSERT INTO vehicles (customer_id, vehicle_name, model, color, vehicle_no, chassis_no)
          VALUES (?, ?, ?, ?, ?, ?);
        `, [
          customerId,
          (vehicleName || model || 'Honda Motorcycle').trim(),
          (model || vehicleName || '').trim(),
          (color || '').trim(),
          null,
          cNo
        ]);
      }
    }

    res.status(201).json({ id: customerId, message: 'Customer created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Customer Profile
app.put('/api/customers/:id', async (req, res) => {
  try {
    const { name, primaryPhone, altPhones, branchId, branchIds, notes } = req.body;
    if (!name || !primaryPhone) {
      return res.status(400).json({ error: 'Name and Primary Phone are required' });
    }

    const cust = await db.get(`SELECT id FROM customers WHERE id = ?;`, [req.params.id]);
    if (!cust) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const bIds = Array.isArray(branchIds) 
      ? branchIds.map(Number).filter(Boolean)
      : (branchIds !== undefined && branchIds !== null ? String(branchIds).split(',').map(Number).filter(Boolean) : (branchId !== undefined ? (branchId ? [parseInt(branchId)] : []) : null));

    const primaryBranchId = bIds !== null ? (bIds.length > 0 ? bIds[0] : null) : (branchId !== undefined ? (branchId ? parseInt(branchId) : null) : cust.branch_id);

    await db.run(`
      UPDATE customers
      SET name = ?, primary_phone = ?, branch_id = ?, notes = ?
      WHERE id = ?;
    `, [
      name.trim(), 
      primaryPhone.trim(), 
      primaryBranchId, 
      notes !== undefined ? (notes ? notes.trim() : null) : cust.notes, 
      cust.id
    ]);

    // Update customer_branches if branchIds or branchId provided
    if (bIds !== null) {
      await db.run(`DELETE FROM customer_branches WHERE customer_id = ?;`, [cust.id]);
      for (const bId of bIds) {
        await db.run(`INSERT OR IGNORE INTO customer_branches (customer_id, outlet_id) VALUES (?, ?);`, [cust.id, bId]);
      }
    }

    // Update alt phones if provided
    if (altPhones !== undefined) {
      await db.run(`DELETE FROM customer_phones WHERE customer_id = ?;`, [cust.id]);
      if (altPhones && altPhones.trim()) {
        const phones = altPhones.split(',').map(p => p.trim()).filter(Boolean);
        for (const phone of phones) {
          await db.run(`INSERT OR IGNORE INTO customer_phones (customer_id, phone) VALUES (?, ?);`, [cust.id, phone]);
        }
      }
    }

    res.json({ success: true, message: 'Customer updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fast Note Update for Customer
app.patch('/api/customers/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const cust = await db.get(`SELECT id FROM customers WHERE id = ?;`, [req.params.id]);
    if (!cust) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    await db.run(`UPDATE customers SET notes = ? WHERE id = ?;`, [notes ? notes.trim() : null, cust.id]);
    res.json({ success: true, notes: notes ? notes.trim() : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Vehicle to Customer Garage
app.post('/api/customers/:id/vehicles', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const cust = await db.get('SELECT id, name FROM customers WHERE id = ?;', [customerId]);
    if (!cust) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const { model, vehicleName, color, vehicleNo, chassisNo } = req.body;
    const finalModel = (model || vehicleName || '').trim();
    const vNo = (vehicleNo || '').trim().toUpperCase() || null;
    const cNo = (chassisNo || '').trim().toUpperCase() || null;

    if (!finalModel && !vNo && !cNo) {
      return res.status(400).json({ error: 'Vehicle model or registration number is required' });
    }

    const vName = finalModel || 'Honda Motorcycle';

    let result;
    if (vNo) {
      result = await db.run(`
        INSERT INTO vehicles (customer_id, vehicle_name, model, color, vehicle_no, chassis_no)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(vehicle_no) DO UPDATE SET
          customer_id = excluded.customer_id,
          vehicle_name = excluded.vehicle_name,
          model = excluded.model,
          color = excluded.color,
          chassis_no = COALESCE(excluded.chassis_no, vehicles.chassis_no);
      `, [customerId, vName, finalModel, (color || '').trim(), vNo, cNo]);
    } else {
      result = await db.run(`
        INSERT INTO vehicles (customer_id, vehicle_name, model, color, vehicle_no, chassis_no)
        VALUES (?, ?, ?, ?, ?, ?);
      `, [customerId, vName, finalModel, (color || '').trim(), null, cNo]);
    }

    res.status(201).json({
      id: result.lastID,
      customerId,
      vehicleName: vName,
      model: finalModel,
      color: (color || '').trim(),
      vehicleNo: vNo,
      chassisNo: cNo,
      message: 'Vehicle added to customer garage successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Customer Profile
app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await db.get('SELECT * FROM customers WHERE id = ?;', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Safely unlink tickets and vehicles to maintain historical integrity
    await db.run('UPDATE tickets SET customer_id = NULL WHERE customer_id = ?;', [customerId]);
    await db.run('UPDATE vehicles SET customer_id = NULL WHERE customer_id = ?;', [customerId]);
    await db.run('DELETE FROM customer_phones WHERE customer_id = ?;', [customerId]);
    await db.run('DELETE FROM customer_branches WHERE customer_id = ?;', [customerId]);
    await db.run('DELETE FROM customers WHERE id = ?;', [customerId]);

    res.json({ success: true, message: `Customer "${customer.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// VEHICLES DIRECTORY & DOSSIER ENDPOINTS
// ==========================================

function getModelFamily(raw) {
  if (!raw) return { key: 'other', name: 'Other Vehicles', category: 'Two-Wheeler' };
  const u = raw.toUpperCase().trim();
  if (u.includes('ACTIVA')) return { key: 'honda-activa', name: 'Honda Activa', category: 'Scooter' };
  if (u.includes('DIO')) return { key: 'honda-dio', name: 'Honda Dio', category: 'Scooter' };
  if (u.includes('UNICORN')) return { key: 'honda-unicorn', name: 'Honda Unicorn', category: 'Motorcycle' };
  if (u.includes('SHINE')) return { key: 'honda-shine', name: 'Honda Shine', category: 'Motorcycle' };
  if (u.includes('SP125') || u.includes('SP 125')) return { key: 'honda-sp125', name: 'Honda SP 125', category: 'Motorcycle' };
  if (u.includes('CB350') || u.includes('HNESS')) return { key: 'honda-cb350', name: 'Honda CB350 / H\'ness', category: 'Motorcycle' };
  if (u.includes('CITY')) return { key: 'honda-city', name: 'Honda City', category: 'Sedan' };
  if (u.includes('ELEVATE')) return { key: 'honda-elevate', name: 'Honda Elevate', category: 'SUV' };
  if (u.includes('CD 110') || u.includes('CD110')) return { key: 'honda-cd110', name: 'Honda CD 110', category: 'Motorcycle' };
  const cleanName = raw.trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { key: slug || 'other', name: cleanName, category: 'Two-Wheeler' };
}

/**
 * GET /api/vehicle-models
 * Returns all distinct vehicle models grouped by family with fleet count,
 * in-workshop count, total historical tickets, and variants.
 */
app.get('/api/vehicle-models', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    const vehicles = await db.all(`
      SELECT v.*,
             c.name AS customer_name,
             c.primary_phone AS customer_phone,
             (SELECT COUNT(*) FROM tickets t WHERE t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AS total_tickets,
             (SELECT t.id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_id,
             (SELECT t.ticket_number FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_number,
             (SELECT t.current_stage_id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_stage_id
      FROM vehicles v
      LEFT JOIN customers c ON c.id = v.customer_id
      ORDER BY v.id DESC;
    `);

    const modelMap = new Map();
    for (const v of vehicles) {
      const fam = getModelFamily(v.model || v.vehicle_name);
      if (!modelMap.has(fam.key)) {
        modelMap.set(fam.key, {
          key: fam.key,
          name: fam.name,
          category: fam.category,
          fleet_count: 0,
          active_in_workshop: 0,
          total_tickets: 0,
          variants: new Set(),
          unit_ids: []
        });
      }
      const m = modelMap.get(fam.key);
      m.fleet_count++;
      if (v.active_ticket_id) m.active_in_workshop++;
      m.total_tickets += (v.total_tickets || 0);
      if (v.model) m.variants.add(v.model);
      m.unit_ids.push(v.id);
    }

    let list = Array.from(modelMap.values()).map(m => ({
      ...m,
      variants: Array.from(m.variants)
    })).sort((a, b) => b.fleet_count - a.fleet_count);

    if (q) {
      list = list.filter(m => {
        return m.name.toLowerCase().includes(q) ||
               m.category.toLowerCase().includes(q) ||
               m.variants.some(varName => varName.toLowerCase().includes(q));
      });
    }

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/vehicle-models/:key
 * Detailed Vehicle Model Dossier:
 * - Model info and summary statistics
 * - People who brought this vehicle (distinct owners, plates, contact info, visit counts)
 * - Service history & technical tickets breakdown with itemized replacement parts
 */
app.get('/api/vehicle-models/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const allVehicles = await db.all(`
      SELECT v.*,
             c.name AS customer_name,
             c.primary_phone AS customer_phone,
             c.notes AS customer_notes,
             o.name AS branch_name,
             (SELECT COUNT(*) FROM tickets t WHERE t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AS total_tickets,
             (SELECT t.id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_id,
             (SELECT t.ticket_number FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_number,
             (SELECT t.current_stage_id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_stage_id
      FROM vehicles v
      LEFT JOIN customers c ON c.id = v.customer_id
      LEFT JOIN outlets o ON o.id = c.branch_id
      ORDER BY v.id DESC;
    `);

    const matchingVehicles = allVehicles.filter(v => getModelFamily(v.model || v.vehicle_name).key === key);
    if (matchingVehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle model not found' });
    }

    const fam = getModelFamily(matchingVehicles[0].model || matchingVehicles[0].vehicle_name);
    const vehicleIds = matchingVehicles.map(v => v.id);
    const vehicleNos = matchingVehicles.map(v => v.vehicle_no).filter(Boolean);

    // Fetch all tickets for vehicles of this model
    let tickets = [];
    if (vehicleIds.length > 0) {
      const vPlaceholders = vehicleIds.map(() => '?').join(',');
      const noPlaceholders = vehicleNos.length > 0 ? vehicleNos.map(() => '?').join(',') : null;
      let sql = `
        SELECT t.id, t.ticket_number, t.outlet_name, t.current_stage_id, t.status,
               t.arrival_date, t.estimate_date, t.approval_date, t.work_complete_date,
               t.delivery_date, t.closure_date, t.damaged_parts, t.estimated_cost,
               t.created_at, t.parts_status_note, t.customer_id, t.customer_name,
               t.customer_phone, t.vehicle_id, t.vehicle_no, t.vehicle_name,
               t.insurance_company, t.surveyor_name, t.surveyor_phone
        FROM tickets t
        WHERE t.vehicle_id IN (${vPlaceholders})
      `;
      const params = [...vehicleIds];
      if (noPlaceholders) {
        sql += ` OR (t.vehicle_no IS NOT NULL AND t.vehicle_no IN (${noPlaceholders})) `;
        params.push(...vehicleNos);
      }
      sql += ` ORDER BY t.id DESC;`;
      tickets = await db.all(sql, params);
    }

    // Attach itemized parts for these tickets
    const ticketIds = tickets.map(t => t.id);
    let allParts = [];
    if (ticketIds.length > 0) {
      const tPlaceholders = ticketIds.map(() => '?').join(',');
      allParts = await db.all(`
        SELECT tp.*, t.ticket_number
        FROM ticket_parts tp
        JOIN tickets t ON t.id = tp.ticket_id
        WHERE tp.ticket_id IN (${tPlaceholders})
        ORDER BY tp.id ASC;
      `, ticketIds);
    }

    const partsByTicket = {};
    const partsSummaryMap = {};
    let totalModelSpend = 0;

    for (const p of allParts) {
      if (!partsByTicket[p.ticket_id]) partsByTicket[p.ticket_id] = [];
      partsByTicket[p.ticket_id].push(p);

      const pKey = (p.part_name || '').trim().toLowerCase();
      if (pKey) {
        if (!partsSummaryMap[pKey]) {
          partsSummaryMap[pKey] = {
            part_name: p.part_name,
            part_code: p.part_code || '—',
            total_qty: 0,
            unit_cost: p.unit_cost || 0,
            total_cost: 0,
            count: 0
          };
        }
        partsSummaryMap[pKey].total_qty += (p.quantity || 1);
        partsSummaryMap[pKey].total_cost += (p.total_cost || 0);
        partsSummaryMap[pKey].count++;
        totalModelSpend += (p.total_cost || 0);
      }
    }

    const enrichedTickets = tickets.map(t => ({
      ...t,
      parts: partsByTicket[t.id] || []
    }));

    // Build "People Who Brought This Vehicle" list
    // Include all registered owners/vehicles of this model, plus any distinct ticket drivers
    const peopleMap = new Map();

    matchingVehicles.forEach(v => {
      const normPhone = v.customer_phone ? v.customer_phone.replace(/\D/g, '') : '';
      const pKey = v.customer_id ? `cust-${v.customer_id}` : (normPhone ? `phone-${normPhone}` : `veh-${v.id}`);

      if (!peopleMap.has(pKey)) {
        peopleMap.set(pKey, {
          name: v.customer_name || 'Vehicle Owner',
          phone: v.customer_phone || '',
          customer_id: v.customer_id || null,
          is_owner: true,
          relationship: 'Registered Owner',
          vehicles: [],
          visit_count: 0,
          last_visit_date: null,
          tickets: []
        });
      }

      const p = peopleMap.get(pKey);
      p.vehicles.push({
        id: v.id,
        vehicle_no: v.vehicle_no,
        model: v.model,
        color: v.color,
        chassis_no: v.chassis_no,
        active_ticket_id: v.active_ticket_id,
        active_ticket_number: v.active_ticket_number,
        active_stage_id: v.active_stage_id,
        total_tickets: v.total_tickets
      });
      p.visit_count += (v.total_tickets || 0);
    });

    // Also scan tickets for any extra drivers
    tickets.forEach(t => {
      if (t.customer_name || t.customer_phone) {
        const normPhone = t.customer_phone ? t.customer_phone.replace(/\D/g, '') : '';
        const pKey = t.customer_id ? `cust-${t.customer_id}` : (normPhone ? `phone-${normPhone}` : `name-${t.customer_name.toLowerCase().trim()}`);

        let person = peopleMap.get(pKey);
        if (!person) {
          person = {
            name: t.customer_name || 'Driver / Contact',
            phone: t.customer_phone || '',
            customer_id: t.customer_id || null,
            is_owner: false,
            relationship: 'Driver / Brought By',
            vehicles: t.vehicle_no ? [{ vehicle_no: t.vehicle_no, model: t.vehicle_name }] : [],
            visit_count: 0,
            last_visit_date: null,
            tickets: []
          };
          peopleMap.set(pKey, person);
        }

        const vDate = t.arrival_date || t.created_at;
        if (!person.last_visit_date || (vDate && new Date(vDate) > new Date(person.last_visit_date))) {
          person.last_visit_date = vDate;
        }

        if (!person.tickets.some(item => item.id === t.id)) {
          person.tickets.push({
            id: t.id,
            ticket_number: t.ticket_number,
            date: vDate,
            stage_id: t.current_stage_id,
            status: t.status,
            vehicle_no: t.vehicle_no
          });
        }
      }
    });

    const peopleList = Array.from(peopleMap.values()).sort((a, b) => {
      if (a.is_owner && !b.is_owner) return -1;
      if (!a.is_owner && b.is_owner) return 1;
      return (b.visit_count - a.visit_count);
    });

    const activeInWorkshop = matchingVehicles.filter(v => Boolean(v.active_ticket_id)).length;
    const variantsList = Array.from(new Set(matchingVehicles.map(v => v.model).filter(Boolean)));

    res.json({
      key: fam.key,
      name: fam.name,
      category: fam.category,
      fleet_count: matchingVehicles.length,
      active_in_workshop: activeInWorkshop,
      total_tickets: tickets.length,
      total_spend: totalModelSpend,
      variants: variantsList,
      units: matchingVehicles,
      people: peopleList,
      tickets: enrichedTickets,
      parts_summary: Object.values(partsSummaryMap).sort((a, b) => b.total_cost - a.total_cost)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/vehicle-models/:key
 * Renames or updates all vehicles belonging to this model group.
 */
app.put('/api/vehicle-models/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Vehicle model name is required' });
    }
    const newName = name.trim();

    const allVehicles = await db.all('SELECT id, model, vehicle_name FROM vehicles;');
    const matchingIds = allVehicles
      .filter(v => getModelFamily(v.model || v.vehicle_name).key === key)
      .map(v => v.id);

    if (matchingIds.length === 0) {
      return res.status(404).json({ error: 'Vehicle model not found' });
    }

    const placeholders = matchingIds.map(() => '?').join(',');
    await db.run(`UPDATE vehicles SET model = ? WHERE id IN (${placeholders});`, [newName, ...matchingIds]);
    res.json({ success: true, message: `Updated ${matchingIds.length} vehicles to model "${newName}"` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/vehicle-models/:key
 * Dissociates and removes all vehicles of this model family.
 */
app.delete('/api/vehicle-models/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const allVehicles = await db.all('SELECT id, model, vehicle_name FROM vehicles;');
    const matchingIds = allVehicles
      .filter(v => getModelFamily(v.model || v.vehicle_name).key === key)
      .map(v => v.id);

    if (matchingIds.length === 0) {
      return res.status(404).json({ error: 'Vehicle model not found' });
    }

    const placeholders = matchingIds.map(() => '?').join(',');
    // 1. Dissociate tickets so history is kept safe
    await db.run(`UPDATE tickets SET vehicle_id = NULL WHERE vehicle_id IN (${placeholders});`, matchingIds);
    // 2. Delete vehicles
    await db.run(`DELETE FROM vehicles WHERE id IN (${placeholders});`, matchingIds);

    res.json({ success: true, message: `Successfully deleted ${matchingIds.length} vehicle records for this model` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vehicles', async (req, res) => {
  try {
    const q = req.query.q || '';
    let sql = `
      SELECT v.*,
             c.name AS customer_name,
             c.primary_phone AS customer_phone,
             (SELECT COUNT(*) FROM tickets t WHERE t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AS total_tickets,
             (SELECT t.id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_id,
             (SELECT t.ticket_number FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_ticket_number,
             (SELECT t.current_stage_id FROM tickets t WHERE (t.vehicle_id = v.id OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = v.vehicle_no)) AND t.status = 'OPEN' ORDER BY t.id DESC LIMIT 1) AS active_stage_id
      FROM vehicles v
      LEFT JOIN customers c ON c.id = v.customer_id
    `;
    const params = [];
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      sql += ` WHERE v.vehicle_no LIKE ? OR v.chassis_no LIKE ? OR v.model LIKE ? OR v.vehicle_name LIKE ? OR c.name LIKE ? OR c.primary_phone LIKE ? `;
      params.push(term, term, term, term, term, term);
    }
    sql += ` ORDER BY v.id DESC;`;
    const vehicles = await db.all(sql, params);
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/vehicles/:id', async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const vehicle = await db.get(`
      SELECT v.*,
             c.name AS customer_name,
             c.primary_phone AS customer_phone,
             c.notes AS customer_notes,
             o.name AS branch_name
      FROM vehicles v
      LEFT JOIN customers c ON c.id = v.customer_id
      LEFT JOIN outlets o ON o.id = c.branch_id
      WHERE v.id = ?;
    `, [vehicleId]);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const tickets = await db.all(`
      SELECT t.id, t.ticket_number, t.outlet_name, t.current_stage_id, t.status,
             t.arrival_date, t.estimate_date, t.approval_date, t.work_complete_date,
             t.delivery_date, t.closure_date, t.damaged_parts, t.estimated_cost,
             t.created_at, t.parts_status_note, t.customer_id, t.customer_name,
             t.customer_phone, t.insurance_company, t.surveyor_name,
             t.surveyor_phone
      FROM tickets t
      WHERE t.vehicle_id = ? OR (t.vehicle_no IS NOT NULL AND t.vehicle_no = ?)
      ORDER BY t.id DESC;
    `, [vehicleId, vehicle.vehicle_no]);

    const ticketIds = tickets.map(t => t.id);
    let allParts = [];
    if (ticketIds.length > 0) {
      const placeholders = ticketIds.map(() => '?').join(',');
      allParts = await db.all(`
        SELECT tp.*, t.ticket_number
        FROM ticket_parts tp
        JOIN tickets t ON t.id = tp.ticket_id
        WHERE tp.ticket_id IN (${placeholders})
        ORDER BY tp.id ASC;
      `, ticketIds);
    }

    const partsByTicket = {};
    for (const p of allParts) {
      if (!partsByTicket[p.ticket_id]) partsByTicket[p.ticket_id] = [];
      partsByTicket[p.ticket_id].push(p);
    }

    const enrichedTickets = tickets.map(t => ({
      ...t,
      parts: partsByTicket[t.id] || []
    }));

    // Aggregate distinct intake people ("people who brought this vehicle")
    const peopleMap = new Map();

    // 1. Registered vehicle owner (if exists)
    if (vehicle.customer_name || vehicle.customer_id) {
      const normPhone = vehicle.customer_phone ? vehicle.customer_phone.replace(/\D/g, '') : '';
      const key = normPhone || (vehicle.customer_name || '').toLowerCase().trim();
      peopleMap.set(key, {
        name: vehicle.customer_name || 'Vehicle Owner',
        phone: vehicle.customer_phone || '',
        customer_id: vehicle.customer_id || null,
        is_owner: true,
        relationship: 'Registered Owner',
        visit_count: 0,
        last_visit_date: null,
        tickets: []
      });
    }

    // 2. Individuals recorded on intake tickets
    for (const t of tickets) {
      if (t.customer_name || t.customer_phone) {
        const normPhone = t.customer_phone ? t.customer_phone.replace(/\D/g, '') : '';
        const key = normPhone || (t.customer_name || '').toLowerCase().trim();

        let person = peopleMap.get(key);
        const isOwner = (vehicle.customer_id && t.customer_id === vehicle.customer_id) ||
                        (vehicle.customer_phone && normPhone && normPhone === (vehicle.customer_phone || '').replace(/\D/g, ''));

        if (!person) {
          person = {
            name: t.customer_name || 'Driver / Contact',
            phone: t.customer_phone || '',
            customer_id: t.customer_id || null,
            is_owner: Boolean(isOwner),
            relationship: isOwner ? 'Registered Owner' : 'Driver / Brought By',
            visit_count: 0,
            last_visit_date: null,
            tickets: []
          };
          peopleMap.set(key, person);
        } else if (isOwner) {
          person.is_owner = true;
          person.relationship = 'Registered Owner';
          if (!person.customer_id && t.customer_id) person.customer_id = t.customer_id;
        }

        person.visit_count++;
        const visitDate = t.arrival_date || t.created_at;
        if (!person.last_visit_date || (visitDate && new Date(visitDate) > new Date(person.last_visit_date))) {
          person.last_visit_date = visitDate;
        }
        person.tickets.push({
          id: t.id,
          ticket_number: t.ticket_number,
          date: visitDate,
          stage_id: t.current_stage_id,
          status: t.status
        });
      }
    }

    const intake_people = Array.from(peopleMap.values()).sort((a, b) => {
      if (a.is_owner && !b.is_owner) return -1;
      if (!a.is_owner && b.is_owner) return 1;
      return (b.visit_count - a.visit_count);
    });

    res.json({
      ...vehicle,
      tickets: enrichedTickets,
      parts_history: allParts,
      intake_people
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { customer_id, vehicle_no, model, color, chassis_no, vehicle_name } = req.body;
    const finalModel = (model || vehicle_name || 'Honda Motorcycle').trim();
    const finalName = (vehicle_name || finalModel).trim();
    const vNo = vehicle_no ? vehicle_no.trim().toUpperCase().replace(/\s+/g, '') : null;
    const cNo = chassis_no ? chassis_no.trim().toUpperCase() : null;

    if (!finalModel) {
      return res.status(400).json({ error: 'Vehicle model is required' });
    }

    if (vNo) {
      const existingPlate = await db.get('SELECT id FROM vehicles WHERE vehicle_no = ?;', [vNo]);
      if (existingPlate) {
        return res.status(409).json({ error: `Vehicle with registration plate ${vNo} already exists` });
      }
    }
    if (cNo) {
      const existingVin = await db.get('SELECT id FROM vehicles WHERE chassis_no = ?;', [cNo]);
      if (existingVin) {
        return res.status(409).json({ error: `Vehicle with VIN/Chassis ${cNo} already exists` });
      }
    }

    const result = await db.run(`
      INSERT INTO vehicles (customer_id, vehicle_no, vehicle_name, model, color, chassis_no)
      VALUES (?, ?, ?, ?, ?, ?);
    `, [customer_id || null, vNo, finalName, finalModel, (color || '').trim() || null, cNo]);

    const created = await db.get('SELECT * FROM vehicles WHERE id = ?;', [result.lastID]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/vehicles/:id', async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const { customer_id, vehicle_no, model, color, chassis_no, vehicle_name } = req.body;
    const finalModel = (model || vehicle_name || '').trim();
    const finalName = (vehicle_name || finalModel).trim();
    const vNo = vehicle_no ? vehicle_no.trim().toUpperCase().replace(/\s+/g, '') : null;
    const cNo = chassis_no ? chassis_no.trim().toUpperCase() : null;

    const existing = await db.get('SELECT * FROM vehicles WHERE id = ?;', [vehicleId]);
    if (!existing) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    if (vNo && vNo !== existing.vehicle_no) {
      const conflict = await db.get('SELECT id FROM vehicles WHERE vehicle_no = ? AND id != ?;', [vNo, vehicleId]);
      if (conflict) {
        return res.status(409).json({ error: `Vehicle with registration plate ${vNo} already exists` });
      }
    }
    if (cNo && cNo !== existing.chassis_no) {
      const conflict = await db.get('SELECT id FROM vehicles WHERE chassis_no = ? AND id != ?;', [cNo, vehicleId]);
      if (conflict) {
        return res.status(409).json({ error: `Vehicle with VIN/Chassis ${cNo} already exists` });
      }
    }

    await db.run(`
      UPDATE vehicles
      SET customer_id = ?,
          vehicle_name = ?,
          model = ?,
          color = ?,
          vehicle_no = ?,
          chassis_no = ?
      WHERE id = ?;
    `, [
      customer_id !== undefined ? customer_id : existing.customer_id,
      finalName || existing.vehicle_name,
      finalModel || existing.model,
      color !== undefined ? ((color || '').trim() || null) : existing.color,
      vNo,
      cNo,
      vehicleId
    ]);

    const updated = await db.get('SELECT * FROM vehicles WHERE id = ?;', [vehicleId]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const vehicle = await db.get('SELECT * FROM vehicles WHERE id = ?;', [vehicleId]);
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    // Safely unlink tickets so historical service records are preserved
    await db.run('UPDATE tickets SET vehicle_id = NULL WHERE vehicle_id = ?;', [vehicleId]);
    await db.run('DELETE FROM vehicles WHERE id = ?;', [vehicleId]);

    res.json({ success: true, message: `Vehicle ${vehicle.model || vehicle.vehicle_no || ''} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PHYSICAL STOCK SYNCHRONIZATION & INVENTORY
// ==========================================

/**
 * Upload an Excel file (.xlsx) to replace physical stock snapshot
 */
app.post('/api/stock/upload-xlsx', async (req, res) => {
  try {
    let buffer = null;
    let filename = req.query.filename || 'uploaded_stock.xlsx';

    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
    } else if (req.body && req.body.base64) {
      buffer = Buffer.from(req.body.base64, 'base64');
      if (req.body.filename) filename = req.body.filename;
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      buffer = Buffer.from(req.body, 'base64');
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'No Excel file data received. Please provide a binary file or base64 payload.' });
    }

    const pool = await db.getPool();
    const result = await stockSync.ingestStockSnapshot(pool, buffer, {
      filename,
      syncMode: 'UPLOAD'
    });

    res.json({
      success: true,
      message: `Successfully synchronized physical stock from ${filename}`,
      stats: result
    });
  } catch (err) {
    console.error('Stock XLSX upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process physical stock file' });
  }
});


/**
 * Get physical stock status summary & metrics
 */
app.get('/api/stock/summary', async (req, res) => {
  try {
    const pool = await db.getPool();
    const summary = await stockSync.getLatestStockSyncSummary(pool);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get detailed batches for a given part number
 */
app.get('/api/stock/batches/:partNumber', async (req, res) => {
  try {
    const pool = await db.getPool();
    const batches = await stockSync.getPartStockBatches(pool, req.params.partNumber);
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PARTS CATALOG & INVENTORY ENDPOINTS
// ==========================================
app.get('/api/parts', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const paginated = req.query.paginated === 'true';
    const inStock = req.query.inStock === 'true';
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    if (paginated) {
      const pool = await db.getPool();
      const result = await stockSync.searchPartsWithStock(pool, {
        query: q,
        inStockOnly: inStock,
        limit,
        offset
      });
      return res.json(result);
    }

    let sql = `
      SELECT p.*,
             COALESCE(tp_agg.total_ordered, 0) AS total_ordered,
             COALESCE(tp_agg.pending_ordered, 0) AS pending_ordered,
             COALESCE(pse_agg.entry_count, 0) AS entry_count
      FROM parts p
      LEFT JOIN (
        SELECT part_code,
               SUM(quantity) AS total_ordered,
               SUM(CASE WHEN part_status = 'ORDERED' THEN quantity ELSE 0 END) AS pending_ordered
        FROM ticket_parts
        WHERE part_code IS NOT NULL AND part_code != ''
        GROUP BY part_code
      ) tp_agg ON tp_agg.part_code = p.part_code
      LEFT JOIN (
        SELECT part_number, COUNT(*) AS entry_count
        FROM physical_stock_entries
        WHERE part_number IS NOT NULL AND part_number != ''
        GROUP BY part_number
      ) pse_agg ON pse_agg.part_number = p.part_code
    `;
    const params = [];
    if (q) {
      const term = `%${q}%`;
      sql += ` WHERE p.part_name ILIKE ? OR p.part_code ILIKE ? OR COALESCE(p.locators, '') ILIKE ? `;
      params.push(term, term, term);
    }
    sql += ` ORDER BY CASE WHEN p.stock_qty > 0 THEN 0 ELSE 1 END, p.part_code ASC, p.part_name ASC`;

    if (req.query.limit && req.query.limit !== 'all') {
      const parsedLimit = parseInt(req.query.limit, 10);
      if (parsedLimit > 0) {
        sql += ` LIMIT ${parsedLimit}`;
      }
    }
    sql += `;`;

    const parts = await db.all(sql, params);
    const enriched = parts.map(p => {
      let stock_status = 'IN_STOCK';
      if (p.stock_qty <= 0) stock_status = 'OUT_OF_STOCK';
      else if (p.stock_qty <= 3) stock_status = 'LOW_STOCK';
      return { ...p, stock_status };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parts/:id', async (req, res) => {
  try {
    const part = await db.get('SELECT * FROM parts WHERE id = ?;', [req.params.id]);
    if (!part) return res.status(404).json({ error: 'Part not found' });

    const usage = await db.all(`
      SELECT tp.*, t.ticket_number, t.customer_name, t.customer_phone, t.vehicle_no, t.model, t.current_stage_id, t.status AS ticket_status, t.created_at AS ticket_created_at
      FROM ticket_parts tp
      JOIN tickets t ON t.id = tp.ticket_id
      WHERE tp.part_name = ? OR (tp.part_code IS NOT NULL AND tp.part_code != '' AND tp.part_code = ?)
      ORDER BY tp.id DESC;
    `, [part.part_name, part.part_code || '']);

    let batches = [];
    if (part.part_code) {
      const pool = await db.getPool();
      batches = await stockSync.getPartStockBatches(pool, part.part_code);
    }

    let stock_status = 'IN_STOCK';
    if (part.stock_qty <= 0) stock_status = 'OUT_OF_STOCK';
    else if (part.stock_qty <= 3) stock_status = 'LOW_STOCK';

    res.json({
      ...part,
      stock_status,
      batches,
      usage_history: usage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/parts', async (req, res) => {
  try {
    const { part_name, part_code, default_cost, stock_qty } = req.body;
    const name = (part_name || '').trim();
    const code = (part_code || '').trim() || null;
    const cost = Math.max(0, Number(default_cost) || 0);
    const qty = Math.max(0, parseInt(stock_qty, 10) || 0);

    if (!name) {
      return res.status(400).json({ error: 'Part name is required' });
    }

    const existing = await db.get('SELECT id FROM parts WHERE part_name = ?;', [name]);
    if (existing) {
      return res.status(409).json({ error: `Part with name "${name}" already exists` });
    }

    const result = await db.run(`
      INSERT INTO parts (part_name, part_code, default_cost, stock_qty)
      VALUES (?, ?, ?, ?);
    `, [name, code, cost, qty]);

    const created = await db.get('SELECT * FROM parts WHERE id = ?;', [result.lastID]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/parts/:id', async (req, res) => {
  try {
    const partId = req.params.id;
    const { part_name, part_code, default_cost, stock_qty } = req.body;
    const existing = await db.get('SELECT * FROM parts WHERE id = ?;', [partId]);
    if (!existing) return res.status(404).json({ error: 'Part not found' });

    const name = (part_name !== undefined ? part_name : existing.part_name).trim();
    const code = part_code !== undefined ? ((part_code || '').trim() || null) : existing.part_code;
    const cost = default_cost !== undefined ? Math.max(0, Number(default_cost) || 0) : existing.default_cost;
    const qty = stock_qty !== undefined ? Math.max(0, parseInt(stock_qty, 10) || 0) : existing.stock_qty;

    if (!name) return res.status(400).json({ error: 'Part name cannot be empty' });

    if (name !== existing.part_name) {
      const conflict = await db.get('SELECT id FROM parts WHERE part_name = ? AND id != ?;', [name, partId]);
      if (conflict) return res.status(409).json({ error: `Part with name "${name}" already exists` });
    }

    await db.run(`
      UPDATE parts
      SET part_name = ?,
          part_code = ?,
          default_cost = ?,
          stock_qty = ?
      WHERE id = ?;
    `, [name, code, cost, qty, partId]);

    const updated = await db.get('SELECT * FROM parts WHERE id = ?;', [partId]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/parts/:id', async (req, res) => {
  try {
    const partId = req.params.id;
    const part = await db.get('SELECT * FROM parts WHERE id = ?;', [partId]);
    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    await db.run('DELETE FROM parts WHERE id = ?;', [partId]);
    res.json({ success: true, message: `Part "${part.part_name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PARTS ORDERS PIPELINE / MONITORING
// ==========================================
app.get('/api/parts-orders', async (req, res) => {
  try {
    const q = req.query.q || '';
    const status = (req.query.status || '').toUpperCase().trim();
    let sql = `
      SELECT tp.*,
             t.ticket_number,
             t.customer_name,
             t.customer_phone,
             t.vehicle_no,
             t.model,
             t.current_stage_id,
             t.status AS ticket_status,
             t.outlet_name,
             t.parts_order_date,
             t.customer_approval_exempt
      FROM ticket_parts tp
      JOIN tickets t ON t.id = tp.ticket_id
    `;
    const conditions = [];
    const params = [];

    if (status && status !== 'ALL') {
      if (status === 'PCA') {
        conditions.push(`t.current_stage_id > 5 AND UPPER(COALESCE(tp.customer_approval_status, '')) = 'PENDING' AND (tp.insurance_approved = 0 OR tp.insurance_approved IS NULL)`);
      } else if (status === 'CA') {
        conditions.push(`t.current_stage_id > 5 AND UPPER(COALESCE(tp.customer_approval_status, '')) = 'APPROVED'`);
      } else if (status === 'POD') {
        conditions.push(`UPPER(COALESCE(tp.part_status, '')) = 'ORDERED'`);
      } else if (status === 'ARRIVED') {
        conditions.push(`UPPER(COALESCE(tp.part_status, '')) = 'ARRIVED'`);
      } else if (status === 'INSURANCE_APPROVED' || status === 'IA') {
        conditions.push(`(tp.insurance_approved = 1 OR tp.company_approved = 1)`);
      } else if (status === 'EXEMPT') {
        conditions.push(`(UPPER(COALESCE(tp.customer_approval_status, '')) = 'EXEMPT' OR t.customer_approval_exempt = 1)`);
      } else {
        conditions.push(`tp.part_status = ?`);
        params.push(status);
      }
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(`(tp.part_name LIKE ? OR tp.part_code LIKE ? OR t.ticket_number LIKE ? OR t.customer_name LIKE ? OR t.vehicle_no LIKE ?)`);
      params.push(term, term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY tp.id DESC;`;
    const orders = await db.all(sql, params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Bulk actions on parts orders (Customer Approve, Insurance Approve, Mark Arrived, Mark Ordered, Exempt)
 */
app.post('/api/parts-orders/bulk-action', optionalAuthenticate, async (req, res) => {
  try {
    const { partIds, action } = req.body;
    if (!Array.isArray(partIds) || partIds.length === 0) {
      return res.status(400).json({ error: 'No parts selected for bulk action' });
    }

    const placeholders = partIds.map(() => '?').join(',');
    const existingParts = await db.all(`SELECT id, ticket_id FROM ticket_parts WHERE id IN (${placeholders})`, partIds);
    if (existingParts.length === 0) {
      return res.status(404).json({ error: 'Selected parts not found' });
    }

    const nowIso = new Date().toISOString();
    const act = (action || '').toUpperCase().trim();

    if (act === 'CUSTOMER_APPROVE') {
      await db.run(`UPDATE ticket_parts SET customer_approval_status = 'APPROVED' WHERE id IN (${placeholders})`, partIds);
    } else if (act === 'INSURANCE_APPROVE') {
      await db.run(`UPDATE ticket_parts SET insurance_approved = 1, company_approved = 1, customer_approval_status = 'NONE' WHERE id IN (${placeholders})`, partIds);
    } else if (act === 'MARK_ARRIVED') {
      await db.run(`UPDATE ticket_parts SET part_status = 'ARRIVED', arrived_at = ? WHERE id IN (${placeholders})`, [nowIso, ...partIds]);
    } else if (act === 'MARK_ORDERED') {
      await db.run(`UPDATE ticket_parts SET part_status = 'ORDERED', arrived_at = NULL WHERE id IN (${placeholders})`, partIds);
    } else if (act === 'EXEMPT') {
      await db.run(`UPDATE ticket_parts SET customer_approval_status = 'EXEMPT' WHERE id IN (${placeholders})`, partIds);
    } else {
      return res.status(400).json({ error: 'Invalid bulk action. Allowed: CUSTOMER_APPROVE, INSURANCE_APPROVE, MARK_ARRIVED, MARK_ORDERED, EXEMPT' });
    }

    const affectedTicketIds = [...new Set(existingParts.map(p => p.ticket_id).filter(Boolean))];
    for (const tId of affectedTicketIds) {
      await db.refreshTicketPartsSummary(tId);
    }

    res.json({ success: true, count: partIds.length, affectedTickets: affectedTicketIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/parts-orders/:id/status', async (req, res) => {
  try {
    const partId = req.params.id;
    const { status, arrived_at } = req.body;
    const existing = await db.get('SELECT * FROM ticket_parts WHERE id = ?;', [partId]);
    if (!existing) return res.status(404).json({ error: 'Part order item not found' });

    const normalizedStatus = (status || 'ORDERED').toUpperCase() === 'ARRIVED' ? 'ARRIVED' : 'ORDERED';
    const timestamp = normalizedStatus === 'ARRIVED' ? (arrived_at || new Date().toISOString()) : null;

    await db.run(`
      UPDATE ticket_parts
      SET part_status = ?, arrived_at = ?
      WHERE id = ?;
    `, [normalizedStatus, timestamp, partId]);

    // Recalculate ticket summary
    await db.refreshTicketPartsSummary(existing.ticket_id);

    const updated = await db.get(`
      SELECT tp.*, t.ticket_number
      FROM ticket_parts tp
      JOIN tickets t ON t.id = tp.ticket_id
      WHERE tp.id = ?;
    `, [partId]);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/parts-orders/:id', async (req, res) => {
  try {
    const orderId = req.params.id;
    const item = await db.get('SELECT * FROM ticket_parts WHERE id = ?;', [orderId]);
    if (!item) {
      return res.status(404).json({ error: 'Part order item not found' });
    }

    try {
      await db.restorePartInventory(item);
    } catch (err) {
      console.error('Error restoring inventory on parts order delete:', err.message);
    }

    await db.run('DELETE FROM ticket_parts WHERE id = ?;', [orderId]);

    // Recalculate ticket summary and damaged parts text
    if (item.ticket_id) {
      await db.refreshTicketPartsSummary(item.ticket_id);
    }

    res.json({ success: true, message: `Part order item "${item.part_name}" removed successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insurance Companies & Surveyors Directory
app.get('/api/insurers', async (req, res) => {
  try {
    const insurers = await db.all(`
      SELECT id, name, contact_info, created_at
      FROM insurance_companies
      ORDER BY name ASC;
    `);

    const surveyors = await db.all(`
      SELECT s.id, s.name, s.phone, sim.insurance_company_id
      FROM surveyors s
      JOIN surveyor_insurance_map sim ON s.id = sim.surveyor_id
      ORDER BY s.name ASC;
    `);

    const tickets = await db.all(`
      SELECT insurance_company, COUNT(*) as count,
             SUM(CASE WHEN status != 'CLOSED' THEN 1 ELSE 0 END) as active_count
      FROM tickets
      WHERE insurance_company IS NOT NULL AND insurance_company != ''
      GROUP BY insurance_company;
    `);

    const ticketCountMap = {};
    for (const t of tickets) {
      if (t.insurance_company) {
        ticketCountMap[t.insurance_company.trim().toLowerCase()] = {
          total: t.count,
          active: t.active_count || 0
        };
      }
    }

    const survMap = {};
    for (const s of surveyors) {
      if (!survMap[s.insurance_company_id]) survMap[s.insurance_company_id] = [];
      survMap[s.insurance_company_id].push({
        id: s.id,
        name: s.name,
        phone: s.phone
      });
    }

    const result = insurers.map(ins => {
      const stats = ticketCountMap[ins.name.trim().toLowerCase()] || { total: 0, active: 0 };
      return {
        ...ins,
        surveyors: survMap[ins.id] || [],
        total_tickets: stats.total,
        active_tickets: stats.active
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Insurer Dossier: Profile, Surveyors with Active Counts & Claims Tickets
app.get('/api/insurers/:id', async (req, res) => {
  try {
    const insurer = await db.get(`
      SELECT * FROM insurance_companies WHERE id = ?;
    `, [req.params.id]);

    if (!insurer) {
      return res.status(404).json({ error: 'Insurer not found' });
    }

    const surveyors = await db.all(`
      SELECT s.id, s.name, s.phone,
        (SELECT COUNT(*) FROM tickets WHERE surveyor_name = s.name AND status != 'CLOSED') as active_claims
      FROM surveyors s
      JOIN surveyor_insurance_map sim ON s.id = sim.surveyor_id
      WHERE sim.insurance_company_id = ?
      ORDER BY s.name ASC;
    `, [insurer.id]);

    const rawTickets = await db.all(`
      SELECT t.id, t.ticket_number, t.current_stage_id, t.status, t.created_at, t.updated_at,
             t.customer_name, t.customer_phone, t.vehicle_no, t.model, t.color,
             t.estimated_cost, t.surveyor_name, t.surveyor_phone,
             o.name as branch_name
      FROM tickets t
      LEFT JOIN outlets o ON t.outlet_id = o.id
      WHERE LOWER(TRIM(t.insurance_company)) = LOWER(TRIM(?))
      ORDER BY t.id DESC;
    `, [insurer.name]);

    const stageMap = Object.fromEntries(slaEngine.STAGE_CONFIG.map(s => [s.id, s.name]));
    const tickets = rawTickets.map(t => ({
      ...t,
      stage_name: stageMap[t.current_stage_id] || ('Stage #' + t.current_stage_id)
    }));

    res.json({
      ...insurer,
      surveyors,
      tickets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new Insurance Company
app.post('/api/insurers', async (req, res) => {
  try {
    const { name, contact_info } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Insurance company name is required' });
    }
    const cleanName = name.trim();
    const existing = await db.get(`SELECT id FROM insurance_companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?));`, [cleanName]);
    if (existing) {
      return res.status(400).json({ error: `An insurance company named "${cleanName}" already exists` });
    }
    const result = await db.run(`INSERT INTO insurance_companies (name, contact_info) VALUES (?, ?);`, [cleanName, (contact_info || '').trim()]);
    res.status(201).json({ id: result.lastID, name: cleanName, contact_info: (contact_info || '').trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing Insurance Company
app.put('/api/insurers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_info } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Insurance company name is required' });
    }

    const insurer = await db.get(`SELECT * FROM insurance_companies WHERE id = ?;`, [id]);
    if (!insurer) {
      return res.status(404).json({ error: 'Insurer not found' });
    }

    const cleanName = name.trim();
    const cleanContact = (contact_info || '').trim();

    // Check name collision with another insurer
    const conflict = await db.get(`SELECT id FROM insurance_companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?;`, [cleanName, id]);
    if (conflict) {
      return res.status(400).json({ error: `Another insurance company named "${cleanName}" already exists` });
    }

    await db.run(`UPDATE insurance_companies SET name = ?, contact_info = ? WHERE id = ?;`, [cleanName, cleanContact, id]);

    // Cascade name update to tickets if name changed
    if (insurer.name !== cleanName) {
      await db.run(`UPDATE tickets SET insurance_company = ? WHERE LOWER(TRIM(insurance_company)) = LOWER(TRIM(?));`, [cleanName, insurer.name]);
    }

    res.json({ id: Number(id), name: cleanName, contact_info: cleanContact, message: 'Insurer updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign or Add Surveyor to an Insurance Company
app.post('/api/insurers/:id/surveyors', async (req, res) => {
  try {
    const { surveyor_id, name, phone } = req.body;
    const insurer = await db.get(`SELECT id FROM insurance_companies WHERE id = ?;`, [req.params.id]);
    if (!insurer) {
      return res.status(404).json({ error: 'Insurer not found' });
    }

    let targetSurveyorId = surveyor_id ? parseInt(surveyor_id, 10) : null;

    if (!targetSurveyorId) {
      if (!name || !phone) {
        return res.status(400).json({ error: 'Please select an existing surveyor or provide name and phone' });
      }
      let surv = await db.get(`SELECT id FROM surveyors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?;`, [name, phone]);
      if (surv) {
        targetSurveyorId = surv.id;
      } else {
        const survRes = await db.run(`INSERT INTO surveyors (name, phone) VALUES (?, ?);`, [name.trim(), phone.trim()]);
        targetSurveyorId = survRes.lastID;
      }
    }

    await db.run(`INSERT OR IGNORE INTO surveyor_insurance_map (surveyor_id, insurance_company_id) VALUES (?, ?);`, [targetSurveyorId, insurer.id]);

    res.status(201).json({ id: targetSurveyorId, message: 'Surveyor assigned successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove Surveyor mapping from an Insurance Company
app.delete('/api/insurers/:id/surveyors/:surveyorId', async (req, res) => {
  try {
    const { id, surveyorId } = req.params;
    await db.run(`
      DELETE FROM surveyor_insurance_map 
      WHERE insurance_company_id = ? AND surveyor_id = ?;
    `, [id, surveyorId]);

    res.json({ success: true, message: 'Surveyor unmapped from insurer successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Insurance Company
app.delete('/api/insurers/:id', async (req, res) => {
  try {
    const insurerId = req.params.id;
    const insurer = await db.get('SELECT * FROM insurance_companies WHERE id = ?;', [insurerId]);
    if (!insurer) {
      return res.status(404).json({ error: 'Insurer not found' });
    }

    await db.run('DELETE FROM surveyor_insurance_map WHERE insurance_company_id = ?;', [insurerId]);
    await db.run('DELETE FROM insurance_companies WHERE id = ?;', [insurerId]);

    res.json({ success: true, message: `Insurance company "${insurer.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register a new surveyor (optionally mapping to an insurer)
app.post('/api/surveyors', async (req, res) => {
  try {
    const { name, phone, insurer_ids } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Surveyor name and phone are required' });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    let surv = await db.get(`SELECT id FROM surveyors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ?;`, [cleanName, cleanPhone]);
    let surveyorId;
    if (surv) {
      surveyorId = surv.id;
    } else {
      const survRes = await db.run(`INSERT INTO surveyors (name, phone) VALUES (?, ?);`, [cleanName, cleanPhone]);
      surveyorId = survRes.lastID;
    }

    if (Array.isArray(insurer_ids) && insurer_ids.length > 0) {
      for (const insId of insurer_ids) {
        await db.run(`INSERT OR IGNORE INTO surveyor_insurance_map (surveyor_id, insurance_company_id) VALUES (?, ?);`, [surveyorId, insId]);
      }
    }

    res.status(201).json({ id: surveyorId, message: 'Surveyor registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an existing Surveyor
app.put('/api/surveyors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, insurer_ids } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Surveyor name and phone are required' });
    }

    const surveyor = await db.get(`SELECT * FROM surveyors WHERE id = ?;`, [id]);
    if (!surveyor) {
      return res.status(404).json({ error: 'Surveyor not found' });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    // Check collision with another surveyor
    const conflict = await db.get(`SELECT id FROM surveyors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND phone = ? AND id != ?;`, [cleanName, cleanPhone, id]);
    if (conflict) {
      return res.status(400).json({ error: `Another surveyor with name "${cleanName}" and phone "${cleanPhone}" already exists` });
    }

    await db.run(`UPDATE surveyors SET name = ?, phone = ? WHERE id = ?;`, [cleanName, cleanPhone, id]);

    // Update insurer mappings if provided
    if (Array.isArray(insurer_ids)) {
      await db.run(`DELETE FROM surveyor_insurance_map WHERE surveyor_id = ?;`, [id]);
      for (const insId of insurer_ids) {
        await db.run(`INSERT OR IGNORE INTO surveyor_insurance_map (surveyor_id, insurance_company_id) VALUES (?, ?);`, [id, insId]);
      }
    }

    // Cascade name and phone update to tickets
    if (surveyor.name !== cleanName || surveyor.phone !== cleanPhone) {
      await db.run(`
        UPDATE tickets 
        SET surveyor_name = ?, surveyor_phone = ? 
        WHERE (LOWER(TRIM(surveyor_name)) = LOWER(TRIM(?)) OR surveyor_phone = ?);
      `, [cleanName, cleanPhone, surveyor.name, surveyor.phone]);
    }

    res.json({ id: Number(id), name: cleanName, phone: cleanPhone, message: 'Surveyor updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Surveyor
app.delete('/api/surveyors/:id', async (req, res) => {
  try {
    const surveyorId = req.params.id;
    const surveyor = await db.get('SELECT * FROM surveyors WHERE id = ?;', [surveyorId]);
    if (!surveyor) {
      return res.status(404).json({ error: 'Surveyor not found' });
    }

    await db.run('DELETE FROM surveyor_insurance_map WHERE surveyor_id = ?;', [surveyorId]);
    await db.run('DELETE FROM surveyors WHERE id = ?;', [surveyorId]);

    res.json({ success: true, message: `Surveyor "${surveyor.name}" deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get individual surveyor details, mapped insurers, SLA metrics, and full claims history
app.get('/api/surveyors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const surveyor = await db.get(`SELECT id, name, phone, created_at FROM surveyors WHERE id = ?;`, [id]);
    if (!surveyor) {
      return res.status(404).json({ error: 'Surveyor not found' });
    }

    const mappings = await db.all(`
      SELECT ic.id, ic.name, ic.contact_info
      FROM surveyor_insurance_map sim
      JOIN insurance_companies ic ON sim.insurance_company_id = ic.id
      WHERE sim.surveyor_id = ?
      ORDER BY ic.name ASC;
    `, [id]);

    const sName = (surveyor.name || '').trim().toLowerCase();
    const sPhone = (surveyor.phone || '').trim();

    const tickets = await db.all(`
      SELECT t.*,
             sl3.completed_at as stage3_completed_at,
             sl4.elapsed_wd as stage4_elapsed_wd, sl4.sla_status as stage4_sla_status, sl4.completed_at as stage4_completed_at,
             sl5.elapsed_wd as stage5_elapsed_wd, sl5.sla_status as stage5_sla_status, sl5.completed_at as stage5_completed_at
      FROM tickets t
      LEFT JOIN stage_logs sl3 ON t.id = sl3.ticket_id AND sl3.stage_id = 3
      LEFT JOIN stage_logs sl4 ON t.id = sl4.ticket_id AND sl4.stage_id = 4
      LEFT JOIN stage_logs sl5 ON t.id = sl5.ticket_id AND sl5.stage_id = 5
      WHERE (LOWER(TRIM(t.surveyor_name)) = ? OR t.surveyor_phone = ?)
      ORDER BY t.id DESC;
    `, [sName, sPhone]);

    const now = new Date();
    const evaluatedTickets = tickets.map(t => {
      const stageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === t.current_stage_id);
      const isCompleted = t.status === 'CLOSED';
      const stageEval = slaEngine.evaluateStageSLA(
        t.current_stage_id,
        t.current_stage_entered_at,
        isCompleted ? t.closure_date : null,
        now
      );
      const isApproved = Boolean(t.approval_date || t.current_stage_id > 5 || t.stage5_completed_at || isCompleted);

      let approvalElapsedWd = null;
      if (t.stage5_elapsed_wd !== null && t.stage5_elapsed_wd !== undefined) {
        approvalElapsedWd = t.stage5_elapsed_wd;
      } else if (t.approval_date && (t.survey_date || t.insurance_intimation_date)) {
        const start = new Date(t.survey_date || t.insurance_intimation_date);
        const end = new Date(t.approval_date);
        approvalElapsedWd = slaEngine.calculateWorkingDays(start, end);
      } else if (isApproved) {
        approvalElapsedWd = 1.0;
      }

      // Show Up SLA: Number of working days it took surveyor to visit from intimation
      let showUpWd = null;
      const intimationDate = t.insurance_intimation_date || t.stage3_completed_at;
      const surveyVisitDate = t.survey_date || t.stage4_completed_at;

      if (intimationDate && surveyVisitDate) {
        showUpWd = slaEngine.calculateWorkingDays(new Date(intimationDate), new Date(surveyVisitDate));
      } else if (t.stage4_elapsed_wd !== null && t.stage4_elapsed_wd !== undefined) {
        showUpWd = t.stage4_elapsed_wd;
      } else if (intimationDate && t.current_stage_id >= 4) {
        showUpWd = slaEngine.calculateWorkingDays(new Date(intimationDate), now);
      } else if (t.current_stage_id > 4 || isCompleted) {
        showUpWd = 2.0;
      }

      return {
        ...t,
        branch_name: t.outlet_name,
        stageName: stageConfig ? stageConfig.name : `Stage ${t.current_stage_id}`,
        kanbanColumn: stageConfig ? stageConfig.kanbanColumn : (t.current_stage_id === 1 ? 'OPEN' : (t.current_stage_id === 13 ? 'CLOSED' : 'IN_PROGRESS')),
        slaLimitWD: stageConfig ? stageConfig.slaLimitWD : null,
        slaElapsedWD: stageEval.elapsedWD,
        slaRemainingWD: stageEval.remainingWD,
        slaStatus: stageEval.status,
        isBreached: stageEval.isBreached,
        isDueSoon: stageEval.isDueSoon,
        slaBadge: stageEval.badge,
        is_approved: isApproved,
        approval_elapsed_wd: approvalElapsedWd,
        show_up_wd: showUpWd
      };
    });

    const activeClaims = evaluatedTickets.filter(t => t.status !== 'CLOSED').length;
    const totalClaims = evaluatedTickets.length;
    const completedSurveys = evaluatedTickets.filter(t => t.stage4_completed_at != null);
    const approvedTickets = evaluatedTickets.filter(t => t.is_approved);
    const approvedClaims = approvedTickets.length;
    const approvalRatePct = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : null;

    let avgApprovalTime = null;
    const approvedWithTime = approvedTickets.filter(t => t.approval_elapsed_wd !== null);
    if (approvedWithTime.length > 0) {
      const sumApprovalWd = approvedWithTime.reduce((acc, t) => acc + (t.approval_elapsed_wd || 0), 0);
      avgApprovalTime = Number((sumApprovalWd / approvedWithTime.length).toFixed(1));
    }

    // Average Show Up SLA (from intimation to survey visit)
    const ticketsWithShowUp = evaluatedTickets.filter(t => t.show_up_wd !== null);
    let avgShowUp = null;
    let onTimeShowUpCount = 0;
    if (ticketsWithShowUp.length > 0) {
      const sumShowUp = ticketsWithShowUp.reduce((acc, t) => acc + (t.show_up_wd || 0), 0);
      avgShowUp = Number((sumShowUp / ticketsWithShowUp.length).toFixed(1));
      onTimeShowUpCount = ticketsWithShowUp.filter(t => t.show_up_wd <= 3).length;
    }

    let avgDays = null;
    let onTimeCount = 0;
    if (completedSurveys.length > 0) {
      const sumWd = completedSurveys.reduce((acc, l) => acc + (l.stage4_elapsed_wd || 0), 0);
      avgDays = Number((sumWd / completedSurveys.length).toFixed(1));
      onTimeCount = completedSurveys.filter(l => l.stage4_sla_status !== 'BREACHED').length;
    }

    const showUpAdherencePct = ticketsWithShowUp.length > 0
      ? Math.round((onTimeShowUpCount / ticketsWithShowUp.length) * 100)
      : null;

    const adherencePct = completedSurveys.length > 0 
      ? Math.round((onTimeCount / completedSurveys.length) * 100)
      : null;

    let slaRating = null;
    if (avgShowUp !== null) {
      if (avgShowUp <= 1.5) slaRating = 'FAST';
      else if (avgShowUp <= 3.0) slaRating = 'ON_TRACK';
      else slaRating = 'BREACHED';
    } else if (avgDays !== null) {
      if (avgDays <= 1.5) slaRating = 'FAST';
      else if (avgDays <= 3.0) slaRating = 'ON_TRACK';
      else slaRating = 'BREACHED';
    }

    res.json({
      ...surveyor,
      insurers: mappings,
      active_claims: activeClaims,
      total_claims: totalClaims,
      approved_claims: approvedClaims,
      approval_rate_pct: approvalRatePct,
      avg_approval_time_wd: avgApprovalTime,
      avg_show_up_wd: avgShowUp,
      show_up_adherence_pct: showUpAdherencePct,
      completed_surveys: completedSurveys.length,
      avg_sla_days_wd: avgDays,
      sla_adherence_pct: adherencePct,
      sla_rating: slaRating,
      tickets: evaluatedTickets
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Surveyors Roster with Average SLA Turnaround & Performance
app.get(['/api/surveyors', '/api/surveyors/performance'], async (req, res) => {
  try {
    const surveyors = await db.all(`
      SELECT s.id, s.name, s.phone, s.created_at
      FROM surveyors s
      ORDER BY s.name ASC;
    `);

    const mappings = await db.all(`
      SELECT sim.surveyor_id, ic.id as insurer_id, ic.name as insurer_name
      FROM surveyor_insurance_map sim
      JOIN insurance_companies ic ON sim.insurance_company_id = ic.id
      ORDER BY ic.name ASC;
    `);

    const mapsBySurv = {};
    for (const m of mappings) {
      if (!mapsBySurv[m.surveyor_id]) mapsBySurv[m.surveyor_id] = [];
      mapsBySurv[m.surveyor_id].push({ id: m.insurer_id, name: m.insurer_name });
    }

    const allTickets = await db.all(`
      SELECT id, ticket_number, current_stage_id, status, surveyor_name, surveyor_phone, insurance_company, approval_date
      FROM tickets
      WHERE surveyor_name IS NOT NULL AND surveyor_name != '';
    `);

    const stage4Logs = await db.all(`
      SELECT sl.ticket_id, sl.elapsed_wd, sl.sla_status, sl.completed_at, t.surveyor_name, t.surveyor_phone
      FROM stage_logs sl
      JOIN tickets t ON sl.ticket_id = t.id
      WHERE sl.stage_id = 4 AND t.surveyor_name IS NOT NULL AND t.surveyor_name != '';
    `);

    const result = surveyors.map(s => {
      const sName = (s.name || '').trim().toLowerCase();
      const sPhone = (s.phone || '').trim();

      const survTickets = allTickets.filter(t => 
        (t.surveyor_name && t.surveyor_name.trim().toLowerCase() === sName) ||
        (t.surveyor_phone && t.surveyor_phone.trim() === sPhone)
      );

      const survLogs = stage4Logs.filter(l => 
        (l.surveyor_name && l.surveyor_name.trim().toLowerCase() === sName) ||
        (l.surveyor_phone && l.surveyor_phone.trim() === sPhone)
      );

      const activeClaims = survTickets.filter(t => t.status !== 'CLOSED').length;
      const totalClaims = survTickets.length;
      const approvedClaims = survTickets.filter(t => t.approval_date != null || t.current_stage_id > 5 || t.status === 'CLOSED').length;
      const approvalRatePct = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : null;
      const completedSurveys = survLogs.filter(l => l.completed_at !== null);

      let avgDays = null;
      let onTimeCount = 0;
      if (completedSurveys.length > 0) {
        const sumWd = completedSurveys.reduce((acc, l) => acc + (l.elapsed_wd || 0), 0);
        avgDays = Number((sumWd / completedSurveys.length).toFixed(1));
        onTimeCount = completedSurveys.filter(l => l.sla_status !== 'BREACHED').length;
      }

      const adherencePct = completedSurveys.length > 0 
        ? Math.round((onTimeCount / completedSurveys.length) * 100)
        : null;

      let slaRating = null;
      if (avgDays !== null) {
        if (avgDays <= 1.5) slaRating = 'FAST';
        else if (avgDays <= 3.0) slaRating = 'ON_TRACK';
        else slaRating = 'BREACHED';
      }

      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        insurers: mapsBySurv[s.id] || [],
        active_claims: activeClaims,
        total_claims: totalClaims,
        approved_claims: approvedClaims,
        approval_rate_pct: approvalRatePct,
        avg_approval_time_wd: avgDays,
        completed_surveys: completedSurveys.length,
        avg_sla_days_wd: avgDays,
        sla_adherence_pct: adherencePct,
        sla_rating: slaRating
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Holidays Settings Endpoints
const HOLIDAYS_FILE = path.join(__dirname, '..', 'config', 'holidays.json');

app.get('/api/holidays', (req, res) => {
  try {
    let holidays = [];
    if (fs.existsSync(HOLIDAYS_FILE)) {
      holidays = JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8'));
    }
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/holidays', (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Holiday name is required' });
    }

    let holidays = [];
    if (fs.existsSync(HOLIDAYS_FILE)) {
      holidays = JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8'));
    }

    const existingIndex = holidays.findIndex(h => h.date === date);
    if (existingIndex >= 0) {
      holidays[existingIndex].name = name.trim();
    } else {
      holidays.push({ date, name: name.trim() });
    }

    holidays.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');

    res.json({ success: true, holidays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/holidays/:date', (req, res) => {
  try {
    const { date } = req.params;
    let holidays = [];
    if (fs.existsSync(HOLIDAYS_FILE)) {
      holidays = JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf8'));
    }

    holidays = holidays.filter(h => h.date !== date);
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    fs.writeFileSync(HOLIDAYS_FILE, JSON.stringify(holidays, null, 2), 'utf8');

    res.json({ success: true, holidays });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// METRICS ENDPOINT
// ==========================================
app.get('/api/metrics', async (req, res) => {
  try {
    const outletId = req.query.branchId || req.query.outletId;
    let query = `SELECT * FROM tickets WHERE 1=1`;
    const params = [];
    if (outletId && outletId !== 'ALL') {
      const outletIds = (Array.isArray(outletId) ? outletId : String(outletId).split(','))
        .map(x => Number(String(x).trim()))
        .filter(x => !isNaN(x) && x > 0);
      if (outletIds.length === 1) {
        query += ` AND outlet_id = ?`;
        params.push(outletIds[0]);
      } else if (outletIds.length > 1) {
        query += ` AND outlet_id IN (${outletIds.map(() => '?').join(',')})`;
        params.push(...outletIds);
      }
    }

    const tickets = await db.all(query, params);
    const now = new Date();

    let totalActive = 0;
    let openCount = 0;
    let inProgressCount = 0;
    let closedCount = 0;
    let breachedCount = 0;
    let dueSoonCount = 0;
    let withinSlaCount = 0;

    for (const t of tickets) {
      if (t.status === 'OPEN') openCount++;
      if (t.status === 'IN_PROGRESS') inProgressCount++;
      if (t.status === 'CLOSED') closedCount++;

      if (t.status !== 'CLOSED') {
        totalActive++;
        const evalRes = slaEngine.evaluateStageSLA(t.current_stage_id, t.current_stage_entered_at, null, now);
        if (evalRes.isBreached) breachedCount++;
        else if (evalRes.isDueSoon) dueSoonCount++;
        else withinSlaCount++;
      }
    }

    res.json({
      totalTickets: tickets.length,
      totalActive,
      openCount,
      inProgressCount,
      closedCount,
      breachedCount,
      dueSoonCount,
      withinSlaCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let runningServer = null;

function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    try {
      const srv = app.listen(port, () => {
        runningServer = srv;
        const actualPort = srv.address().port;
        console.log(`Honda Service Ticketing Server running at http://localhost:${actualPort}`);
        resolve({ app, server: srv, port: actualPort });
      });
      srv.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`Port ${port} is already in use.`);
        }
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (runningServer) {
      runningServer.close(() => {
        runningServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

if (require.main === module) {
  startServer(PORT).catch((err) => {
    console.error('Failed to start server:', err);
  });
}

module.exports = { app, startServer, stopServer };

