/**
 * Working Days SLA Calculator for Frontend UI
 * Schedule: Monday to Saturday are working days (Sunday = 0 is non-working).
 */

export function isWorkingDay(dateObj) {
  const day = dateObj.getDay();
  return day !== 0; // Sunday is non-working
}

export function calculateWorkingDays(startDate, endDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end <= start) return 0;

  let workingDays = 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);

  const endNorm = new Date(end);
  endNorm.setHours(0, 0, 0, 0);

  while (cur < endNorm) {
    cur.setDate(cur.getDate() + 1);
    if (isWorkingDay(cur)) {
      workingDays++;
    }
  }

  return workingDays;
}

export function evaluateSlaStatus(elapsedWd, limitWd) {
  if (!limitWd || limitWd <= 0) return { status: 'HEALTHY', badgeClass: 'badge-sla-green' };
  
  if (elapsedWd >= limitWd) {
    return { status: 'BREACHED', badgeClass: 'badge-sla-red' };
  }
  if (elapsedWd >= limitWd * 0.75) {
    return { status: 'WARNING', badgeClass: 'badge-sla-amber' };
  }
  return { status: 'HEALTHY', badgeClass: 'badge-sla-green' };
}
