const fs = require('fs');
const path = require('path');
const db = require('./db');
const slaEngine = require('./slaEngine');

const ALERTS_CONFIG_FILE = path.join(__dirname, '..', 'config', 'alerts.json');

function getAlertConfig() {
  try {
    if (fs.existsSync(ALERTS_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(ALERTS_CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading alerts.json:', err.message);
  }
  return {
    gasWebAppUrl: '',
    enabled: false,
    notificationEmails: []
  };
}

/**
 * Scan active tickets and return categorized breach summary (Today vs All-Time) across outlets
 */
async function getBreachedTicketsSummary() {
  const tickets = await db.all(`
    SELECT * FROM tickets 
    WHERE status != 'CLOSED'
    ORDER BY outlet_id ASC, current_stage_entered_at ASC;
  `);

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const allBreachedList = [];
  const allDueSoonList = [];

  const todayBreachedList = [];
  const todayDueSoonList = [];
  let todayActiveCount = 0;

  for (const t of tickets) {
    const stageEval = slaEngine.evaluateStageSLA(t.current_stage_id, t.current_stage_entered_at, null, now);
    const stageConfig = slaEngine.STAGE_CONFIG.find(s => s.id === t.current_stage_id);

    const enteredDateIso = t.current_stage_entered_at ? new Date(t.current_stage_entered_at).toISOString().slice(0, 10) : '';
    const createdDateIso = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '';
    const isEnteredToday = enteredDateIso === todayIso || createdDateIso === todayIso;

    const daysOverdue = Math.max(0, stageEval.elapsedWD - (stageEval.limitWD || 0));
    const isBreachedToday = stageEval.isBreached && (daysOverdue <= 1 || isEnteredToday);

    const ticketSummary = {
      id: t.id,
      ticketNumber: t.ticket_number,
      outletId: t.outlet_id,
      outletName: t.outlet_name,
      customerName: t.customer_name,
      customerPhone: t.customer_phone,
      vehicleNo: t.vehicle_no,
      vehicleName: t.vehicle_name,
      chassisNumber: t.chassis_number,
      currentStageId: t.current_stage_id,
      currentStageName: stageConfig ? stageConfig.name : `Stage ${t.current_stage_id}`,
      kanbanColumn: stageConfig ? stageConfig.kanbanColumn : (t.current_stage_id === 1 ? 'OPEN' : (t.current_stage_id === 13 ? 'CLOSED' : 'IN_PROGRESS')),
      maxSlaWD: stageEval.limitWD,
      elapsedWD: stageEval.elapsedWD,
      daysOverdue,
      slaStatus: stageEval.status,
      badge: stageEval.badge,
      enteredAt: t.current_stage_entered_at,
      createdAt: t.created_at,
      isBreachedToday,
      isEnteredToday
    };

    if (isEnteredToday || stageEval.isDueSoon || isBreachedToday) {
      todayActiveCount++;
    }

    if (stageEval.isBreached) {
      allBreachedList.push(ticketSummary);
      if (isBreachedToday) {
        todayBreachedList.push(ticketSummary);
      }
    } else if (stageEval.isDueSoon) {
      allDueSoonList.push(ticketSummary);
      if (isEnteredToday || stageEval.remainingWD <= 1) {
        todayDueSoonList.push(ticketSummary);
      }
    }
  }

  function groupOutlets(list) {
    const groups = {};
    for (const b of list) {
      if (!groups[b.outletName]) {
        groups[b.outletName] = {
          outletName: b.outletName,
          outletId: b.outletId,
          count: 0,
          tickets: []
        };
      }
      groups[b.outletName].count++;
      groups[b.outletName].tickets.push(b);
    }
    return Object.values(groups);
  }

  const allOutlets = groupOutlets(allBreachedList);
  const todayOutlets = groupOutlets(todayBreachedList);

  return {
    generatedAt: now.toISOString(),
    // Cumulative / All-Time
    totalActiveTickets: tickets.length,
    totalBreaches: allBreachedList.length,
    totalDueSoon: allDueSoonList.length,
    outlets: allOutlets,
    breachedTickets: allBreachedList,
    dueSoonTickets: allDueSoonList,

    // Today specific scope
    today: {
      totalActive: Math.max(todayActiveCount, todayBreachedList.length + todayDueSoonList.length),
      totalBreaches: todayBreachedList.length,
      totalDueSoon: todayDueSoonList.length,
      outlets: todayOutlets,
      breachedTickets: todayBreachedList,
      dueSoonTickets: todayDueSoonList
    },

    // All Time specific scope
    allTime: {
      totalActive: tickets.length,
      totalBreaches: allBreachedList.length,
      totalDueSoon: allDueSoonList.length,
      outlets: allOutlets,
      breachedTickets: allBreachedList,
      dueSoonTickets: allDueSoonList
    }
  };
}

/**
 * Format Google Apps Script Webhook payload for End-of-Day manager reports
 */
async function generateGasWebhookPayload(scope = 'all') {
  const summary = await getBreachedTicketsSummary();
  const config = getAlertConfig();

  const reportData = (scope === 'today') ? summary.today : summary.allTime;

  return {
    event: 'EOD_SLA_BREACH_REPORT',
    scope: scope.toUpperCase(),
    timestamp: summary.generatedAt,
    recipients: config.notificationEmails || [],
    reportDate: new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    metrics: {
      totalActive: reportData.totalActive,
      totalBreached: reportData.totalBreaches,
      totalDueSoon: reportData.totalDueSoon
    },
    todayMetrics: {
      totalActive: summary.today.totalActive,
      totalBreached: summary.today.totalBreaches,
      totalDueSoon: summary.today.totalDueSoon
    },
    allTimeMetrics: {
      totalActive: summary.allTime.totalActive,
      totalBreached: summary.allTime.totalBreaches,
      totalDueSoon: summary.allTime.totalDueSoon
    },
    outletsReport: reportData.outlets.map(o => ({
      outletName: o.outletName,
      breachCount: o.count,
      tickets: o.tickets.map(t => ({
        ticketNumber: t.ticketNumber,
        customer: `${t.customerName} (${t.customerPhone})`,
        vehicle: `${t.vehicleName} [${t.vehicleNo || 'Reg Pending'}]`,
        chassis: t.chassisNumber,
        stage: t.currentStageName,
        slaAllowed: `${t.maxSlaWD} WD`,
        elapsed: `${t.elapsedWD} WD`,
        overdueBy: `${t.daysOverdue} WD`,
        isBreachedToday: t.isBreachedToday
      }))
    }))
  };
}

module.exports = {
  getAlertConfig,
  getBreachedTicketsSummary,
  generateGasWebhookPayload
};
