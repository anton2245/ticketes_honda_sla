const fs = require('fs');
const path = require('path');

const HOLIDAYS_FILE = path.join(__dirname, '..', 'config', 'holidays.json');

// Load holidays from config file
function getHolidays() {
  try {
    if (fs.existsSync(HOLIDAYS_FILE)) {
      const content = fs.readFileSync(HOLIDAYS_FILE, 'utf8');
      const list = JSON.parse(content);
      return new Set(list.map(item => item.date));
    }
  } catch (err) {
    console.error('Error reading holidays.json:', err.message);
  }
  return new Set();
}

/**
 * Check if a date is a working day.
 * Schedule: Monday to Saturday are working days (0 is Sunday, which is non-working).
 * Also checks against workshop holidays.
 */
function isWorkingDay(dateObj, holidaySet) {
  const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  if (dayOfWeek === 0) {
    return false; // Sunday is non-working
  }
  const isoDate = dateObj.toISOString().slice(0, 10);
  if (holidaySet && holidaySet.has(isoDate)) {
    return false; // Configured holiday
  }
  return true;
}

/**
 * Calculate the number of working days elapsed between startDate and endDate.
 * If startDate and endDate are on the same calendar day, elapsed WD is 0.
 * For each full working day transition, increments count.
 */
function calculateWorkingDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0;
  }

  if (end <= start) {
    return 0;
  }

  const holidays = getHolidays();
  let workingDays = 0;
  
  // Clone start to iterate day by day
  const current = new Date(start);
  // Normalize time to midnight to count whole days accurately
  current.setHours(0, 0, 0, 0);
  
  const target = new Date(end);
  target.setHours(0, 0, 0, 0);

  // If start and end are on the same date
  if (current.getTime() === target.getTime()) {
    return 0;
  }

  // Iterate day by day from the next day up to target date
  current.setDate(current.getDate() + 1);

  while (current <= target) {
    if (isWorkingDay(current, holidays)) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workingDays;
}

/**
 * Default Stage definitions based on ticket_system_plan.txt & user specification
 */
const DEFAULT_STAGE_CONFIG = [
  {
    id: 1,
    name: 'Vehicle Arrival',
    slaLimitWD: 1,
    isOptional: false,
    kanbanColumn: 'OPEN',
    description: 'Vehicle intake and customer reception.',
    defaultRef: '1 WD',
    note: 'Its should only be in here for one day'
  },
  {
    id: 2,
    name: 'Estimate Preparation',
    slaLimitWD: 2,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Estimate preparation and costing.',
    defaultRef: '2 WD',
    note: ''
  },
  {
    id: 3,
    name: 'Insurance Intimation',
    slaLimitWD: 1,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Estimate submitted to insurance company.',
    defaultRef: '1 WD',
    note: ''
  },
  {
    id: 4,
    name: 'Survey',
    slaLimitWD: 3,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Physical vehicle survey by insurance surveyor.',
    defaultRef: '3 WD',
    note: ''
  },
  {
    id: 5,
    name: 'Approval',
    slaLimitWD: 2,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Surveyor approves claim estimate.',
    defaultRef: '2 WD',
    note: ''
  },
  {
    id: 6,
    name: 'Parts Order',
    slaLimitWD: 10,
    isOptional: true,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Order required replacement parts.',
    defaultRef: '10 WD',
    note: ''
  },
  {
    id: 7,
    name: 'Parts Arrival',
    slaLimitWD: 1,
    isOptional: true,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Ordered parts received at workshop.',
    defaultRef: '1 WD',
    note: ''
  },
  {
    id: 8,
    name: 'Work Start',
    slaLimitWD: 2,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Body & mechanical repair work commenced.',
    defaultRef: '2 WD',
    note: ''
  },
  {
    id: 9,
    name: 'Work Complete',
    slaLimitWD: 3,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Repair work completed and quality checked.',
    defaultRef: '3 WD',
    note: ''
  },
  {
    id: 10,
    name: 'Invoice',
    slaLimitWD: 1,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Final bill & invoice generated.',
    defaultRef: '1 WD',
    note: ''
  },
  {
    id: 11,
    name: 'Resurvey',
    slaLimitWD: 2,
    isOptional: false,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Post-repair resurvey by insurance surveyor.',
    defaultRef: '2 WD',
    note: ''
  },
  {
    id: 12,
    name: 'Waiting Customer Delivery',
    slaLimitWD: 15,
    isOptional: true,
    kanbanColumn: 'IN_PROGRESS',
    description: 'Vehicle ready and waiting for customer pickup.',
    defaultRef: '15 WD',
    note: ''
  },
  {
    id: 13,
    name: 'Customer Delivery',
    slaLimitWD: null,
    isOptional: false,
    kanbanColumn: 'CLOSED',
    description: 'Vehicle delivered to customer and ticket closed.',
    defaultRef: 'Done',
    note: 'Delivered'
  }
];

const SLA_CONFIG_FILE = path.join(__dirname, '..', 'config', 'sla_config.json');

// Active working stage config
let STAGE_CONFIG = JSON.parse(JSON.stringify(DEFAULT_STAGE_CONFIG));

function loadSlaConfig() {
  try {
    if (fs.existsSync(SLA_CONFIG_FILE)) {
      const overrides = JSON.parse(fs.readFileSync(SLA_CONFIG_FILE, 'utf8'));
      STAGE_CONFIG.forEach(stage => {
        if (overrides[stage.id] !== undefined) {
          const customLimit = Number(overrides[stage.id]);
          if (!isNaN(customLimit) && customLimit >= 0) {
            stage.slaLimitWD = customLimit;
          }
        }
      });
    }
  } catch (err) {
    console.error('Error loading sla_config.json:', err.message);
  }
}

// Initial load
loadSlaConfig();

function updateSlaLimits(updates) {
  // updates can be an array [{ id: 1, slaLimitWD: 1 }] or object { 1: 1, 2: 2 }
  const currentOverrides = {};
  
  if (Array.isArray(updates)) {
    updates.forEach(u => {
      const stage = STAGE_CONFIG.find(s => s.id === Number(u.id));
      if (stage && u.slaLimitWD !== undefined) {
        const val = Number(u.slaLimitWD);
        if (!isNaN(val) && val >= 0) {
          stage.slaLimitWD = val;
          currentOverrides[stage.id] = val;
        }
      }
    });
  } else if (typeof updates === 'object' && updates !== null) {
    Object.keys(updates).forEach(idKey => {
      const stage = STAGE_CONFIG.find(s => s.id === Number(idKey));
      if (stage) {
        const val = Number(updates[idKey]);
        if (!isNaN(val) && val >= 0) {
          stage.slaLimitWD = val;
          currentOverrides[stage.id] = val;
        }
      }
    });
  }

  // Also include all current stage limits
  STAGE_CONFIG.forEach(s => {
    if (s.slaLimitWD !== null) {
      currentOverrides[s.id] = s.slaLimitWD;
    }
  });

  fs.writeFileSync(SLA_CONFIG_FILE, JSON.stringify(currentOverrides, null, 2), 'utf8');
  return getStagesWithDefaults();
}

function resetSlaLimits() {
  STAGE_CONFIG = JSON.parse(JSON.stringify(DEFAULT_STAGE_CONFIG));
  if (fs.existsSync(SLA_CONFIG_FILE)) {
    try {
      fs.unlinkSync(SLA_CONFIG_FILE);
    } catch (err) {
      console.error('Error removing sla_config.json:', err.message);
    }
  }
  return getStagesWithDefaults();
}

function getStagesWithDefaults() {
  return STAGE_CONFIG.map(s => {
    const def = DEFAULT_STAGE_CONFIG.find(d => d.id === s.id);
    return {
      ...s,
      defaultSlaLimitWD: def ? def.slaLimitWD : null,
      defaultRef: def ? def.defaultRef : (def && def.slaLimitWD !== null ? `${def.slaLimitWD} WD` : '—'),
      note: s.note !== undefined ? s.note : (def ? def.note : '')
    };
  });
}

/**
 * Get next eligible stage based on ticket branches
 */
function getNextStageId(currentStageId, partsOrderRequired = false, resurveyRequired = false) {
  if (currentStageId === 1) return 2;
  if (currentStageId === 2) return 3;
  if (currentStageId === 3) return 4;
  if (currentStageId === 4) return 5;
  if (currentStageId === 5) {
    return partsOrderRequired ? 6 : 8; // If no parts ordered, jump to Work Start
  }
  if (currentStageId === 6) return 7;
  if (currentStageId === 7) return 8;
  if (currentStageId === 8) return 9;
  if (currentStageId === 9) return 10;
  if (currentStageId === 10) {
    return resurveyRequired ? 11 : 12; // If resurvey not needed, jump to Waiting Customer Delivery
  }
  if (currentStageId === 11) return 12;
  if (currentStageId === 12) return 13;
  return 13; // Already at closed / delivered
}

/**
 * Compute SLA status for a given stage on a ticket
 */
function evaluateStageSLA(stageId, enteredAt, completedAt = null, now = new Date()) {
  const stage = STAGE_CONFIG.find(s => s.id === stageId);
  if (!stage || stage.slaLimitWD === null) {
    return {
      status: completedAt ? 'COMPLETED' : 'WITHIN_SLA',
      badge: completedAt ? '✅' : '🟢',
      elapsedWD: 0,
      limitWD: null,
      remainingWD: null,
      isBreached: false,
      isDueSoon: false
    };
  }

  const referenceEnd = completedAt ? new Date(completedAt) : now;
  const elapsedWD = calculateWorkingDays(new Date(enteredAt), referenceEnd);
  const limitWD = stage.slaLimitWD;
  const remainingWD = limitWD - elapsedWD;

  if (completedAt) {
    const isBreached = elapsedWD > limitWD;
    return {
      status: 'COMPLETED',
      badge: '✅',
      elapsedWD,
      limitWD,
      remainingWD: 0,
      isBreached,
      isDueSoon: false
    };
  }

  if (elapsedWD > limitWD) {
    return {
      status: 'BREACHED',
      badge: '🔴',
      elapsedWD,
      limitWD,
      remainingWD,
      isBreached: true,
      isDueSoon: false
    };
  }

  if (remainingWD <= 1) {
    return {
      status: 'DUE_SOON',
      badge: '🟠',
      elapsedWD,
      limitWD,
      remainingWD,
      isBreached: false,
      isDueSoon: true
    };
  }

  return {
    status: 'WITHIN_SLA',
    badge: '🟢',
    elapsedWD,
    limitWD,
    remainingWD,
    isBreached: false,
    isDueSoon: false
  };
}

module.exports = {
  getHolidays,
  isWorkingDay,
  calculateWorkingDays,
  STAGE_CONFIG,
  DEFAULT_STAGE_CONFIG,
  getStagesWithDefaults,
  updateSlaLimits,
  resetSlaLimits,
  getNextStageId,
  evaluateStageSLA
};
