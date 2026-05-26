/**
 * samsara.js — Samsara ELD adapter.
 * Normalises Samsara HOS webhook payloads into the canonical ELDEvent shape.
 * See: https://developers.samsara.com/docs/hos-logs
 */

function normalise(raw) {
  const hos = raw.data?.hosStatus || {};
  return {
    driverId:              raw.driverId,            // mapped from your driver DB
    truckId:               raw.truckId ?? null,
    eventType:             mapDutyStatus(hos.currentDutyStatus),
    startAt:               hos.cycleStartTime ?? null,
    drivingHoursRemaining: hos.timeUntilBreak   != null ? hos.timeUntilBreak   / 3600 : null,
    onDutyHoursRemaining:  hos.shiftDriveRemaining != null ? hos.shiftDriveRemaining / 3600 : null,
    weeklyHoursRemaining:  hos.cycleRemaining   != null ? hos.cycleRemaining   / 3600 : null,
    lat:                   raw.data?.location?.latitude  ?? null,
    lng:                   raw.data?.location?.longitude ?? null,
    location:              raw.data?.location?.reverseGeo?.formattedLocation ?? null,
    source:                'SAMSARA',
  };
}

function mapDutyStatus(status) {
  const map = {
    off_duty:       'OFF_DUTY',
    sleeper_bed:    'SLEEPER',
    driving:        'DRIVING',
    on_duty:        'ON_DUTY',
    personal_conveyance: 'PC',
    yard_moves:     'YM',
  };
  return map[status] || 'ON_DUTY';
}

module.exports = { normalise };
