/**
 * hosEngine.js — Hours of Service monitoring engine.
 *
 * Continuously evaluates all active drivers' HOS states and raises
 * proactive alerts BEFORE a violation occurs, not after.
 *
 * Rule sets:
 *   US_PROPERTY   — 11h driving / 14h on-duty / 70h / 8-day
 *   US_PASSENGER  — 10h driving / 15h on-duty / 60h / 7-day
 *   CANADA        — 13h driving / 14h on-duty / 70h / 7-day
 *   CANADA_NORTH  — 15h driving / 18h on-duty / 80h / 7-day
 */

const prisma = require('../lib/prisma');

const HOS_RULES = {
  US_PROPERTY:  { maxDriving: 11, maxOnDuty: 14, maxWeekly: 70, breakAfter: 8 },
  US_PASSENGER: { maxDriving: 10, maxOnDuty: 15, maxWeekly: 60, breakAfter: 8 },
  CANADA:       { maxDriving: 13, maxOnDuty: 14, maxWeekly: 70, breakAfter: 8 },
  CANADA_NORTH: { maxDriving: 15, maxOnDuty: 18, maxWeekly: 80, breakAfter: 8 },
};

const WARNING_BUFFER = parseFloat(process.env.HOS_WARNING_BUFFER_MINUTES || '45') / 60; // convert to hours
const WEEKLY_WARNING  = parseFloat(process.env.HOS_WEEKLY_WARNING_HOURS   || '10');

let _io = null;
function setSocketIO(io) { _io = io; }

/**
 * Evaluate a single driver's HOS state and raise alerts if needed.
 * Called on every ELD update and on a 5-minute polling interval.
 */
async function evaluateDriver(driverId) {
  const driver = await prisma.driver.findUnique({
    where:   { id: driverId },
    include: { loads: { where: { status: { in: ['ASSIGNED', 'IN_TRANSIT', 'AT_PICKUP', 'AT_DELIVERY'] } }, take: 1 } },
  });
  if (!driver || !driver.isActive) return;

  const rules  = HOS_RULES[driver.hosRuleSet] || HOS_RULES.US_PROPERTY;
  const loadId = driver.loads[0]?.id ?? null;
  const alerts = [];

  // ── 1. Driving hours warning ───────────────────────────────────────────────
  const drivingRemaining = driver.currentHosDriving;
  if (drivingRemaining > 0 && drivingRemaining <= WARNING_BUFFER) {
    alerts.push({
      alertType:       'HOS_WARNING',
      minutesRemaining: Math.round(drivingRemaining * 60),
      message:         `Driver within ${Math.round(drivingRemaining * 60)} min of daily driving limit (${rules.maxDriving}h rule)`,
    });
  }

  // ── 2. Violation — driving hours ───────────────────────────────────────────
  if (drivingRemaining <= 0) {
    alerts.push({
      alertType:   'VIOLATION_DETECTED',
      ruleViolated: `Driving limit exceeded (${rules.maxDriving}h)`,
      message:     `VIOLATION: Driver has exceeded the ${rules.maxDriving}h driving limit`,
    });
  }

  // ── 3. Break required ──────────────────────────────────────────────────────
  // Check continuous driving time from most recent logs
  const recentLogs = await prisma.hOSLog.findMany({
    where:   { driverId, eventType: 'DRIVING' },
    orderBy: { startAt: 'desc' },
    take:    20,
  });
  const continuousHrs = calcContinuousDriving(recentLogs);
  if (continuousHrs >= rules.breakAfter - (WARNING_BUFFER)) {
    alerts.push({
      alertType:       'BREAK_REQUIRED',
      minutesRemaining: Math.round((rules.breakAfter - continuousHrs) * 60),
      message:         `Driver approaching ${rules.breakAfter}h continuous driving — 30-minute break required`,
    });
  }

  // ── 4. Weekly hours warning ────────────────────────────────────────────────
  const weeklyRemaining = driver.currentHosWeekly;
  if (weeklyRemaining <= WEEKLY_WARNING && weeklyRemaining > 0) {
    alerts.push({
      alertType:       'WEEKLY_LIMIT_WARNING',
      minutesRemaining: Math.round(weeklyRemaining * 60),
      message:         `Driver within ${weeklyRemaining.toFixed(1)}h of weekly limit (${rules.maxWeekly}h / 8-day)`,
    });
  }

  // Persist and broadcast new alerts
  for (const alert of alerts) {
    // Avoid duplicate alerts within 30 minutes
    const existing = await prisma.hOSAlert.findFirst({
      where: {
        driverId,
        alertType:  alert.alertType,
        isRead:     false,
        createdAt:  { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
    if (existing) continue;

    const created = await prisma.hOSAlert.create({
      data: { driverId, loadId, ...alert },
    });

    // Update driver status to VIOLATION if applicable
    if (alert.alertType === 'VIOLATION_DETECTED') {
      await prisma.driver.update({ where: { id: driverId }, data: { status: 'VIOLATION' } });
    }

    // Emit real-time socket event
    if (_io) {
      const event = alert.alertType === 'VIOLATION_DETECTED' ? 'hos:violation' : 'hos:alert';
      _io.emit(event, { driverId, truckId: driver.truckId, ...created });
    }
  }

  return alerts;
}

/**
 * Evaluate all active drivers. Called on a 5-minute interval.
 */
async function evaluateAll() {
  const activeDrivers = await prisma.driver.findMany({
    where: { status: { in: ['ON_DUTY', 'AVAILABLE'] }, isActive: true },
    select: { id: true },
  });
  for (const d of activeDrivers) {
    await evaluateDriver(d.id).catch(console.error);
  }
}

/**
 * Update a driver's HOS from an ELD event payload.
 */
async function applyELDEvent(driverId, event) {
  const updates = {};

  if (event.drivingHoursRemaining  != null) updates.currentHosDriving = event.drivingHoursRemaining;
  if (event.onDutyHoursRemaining   != null) updates.currentHosOnDuty  = event.onDutyHoursRemaining;
  if (event.weeklyHoursRemaining   != null) updates.currentHosWeekly  = event.weeklyHoursRemaining;
  updates.lastHosUpdate = new Date();

  if (Object.keys(updates).length) {
    await prisma.driver.update({ where: { id: driverId }, data: updates });
  }

  // Log the event
  if (event.eventType) {
    await prisma.hOSLog.create({
      data: {
        driverId,
        truckId:   event.truckId    ?? null,
        eventType: event.eventType,
        startAt:   event.startAt    ? new Date(event.startAt) : new Date(),
        endAt:     event.endAt      ? new Date(event.endAt)   : null,
        durationMin: event.durationMin ?? null,
        location:  event.location   ?? null,
        lat:       event.lat        ?? null,
        lng:       event.lng        ?? null,
        source:    event.source     ?? 'WEBHOOK',
      },
    });
  }

  // Re-evaluate immediately after update
  await evaluateDriver(driverId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcContinuousDriving(logs) {
  // Walk backwards through logs and sum DRIVING time until a break
  let total = 0;
  for (const log of logs) {
    if (log.eventType !== 'DRIVING') break; // hit a non-driving event = reset
    if (log.durationMin) total += log.durationMin / 60;
  }
  return total;
}

// Start polling interval
let pollingInterval = null;
function startPolling(intervalMs = 5 * 60 * 1000) {
  if (pollingInterval) return;
  pollingInterval = setInterval(() => evaluateAll().catch(console.error), intervalMs);
  console.log(`⏱  HOS engine polling every ${intervalMs / 60000} min`);
}

module.exports = { evaluateDriver, evaluateAll, applyELDEvent, setSocketIO, startPolling };
