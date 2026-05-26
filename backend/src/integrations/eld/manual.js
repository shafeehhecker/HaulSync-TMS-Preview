/**
 * manual.js — Manual / webhook ELD adapter.
 * Accepts already-normalised data — no transformation needed.
 */

/**
 * @typedef {Object} ELDEvent
 * @property {string} driverId
 * @property {string} [truckId]
 * @property {string} eventType  ON_DUTY | OFF_DUTY | DRIVING | SLEEPER | PC | YM
 * @property {string} [startAt]  ISO 8601
 * @property {string} [endAt]    ISO 8601
 * @property {number} [durationMin]
 * @property {number} [drivingHoursRemaining]
 * @property {number} [onDutyHoursRemaining]
 * @property {number} [weeklyHoursRemaining]
 * @property {string} [location]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {string} source  'MANUAL' | 'WEBHOOK'
 */

function normalise(raw) {
  // Manual adapter: data is already in canonical form
  return { ...raw, source: raw.source || 'MANUAL' };
}

module.exports = { normalise };
