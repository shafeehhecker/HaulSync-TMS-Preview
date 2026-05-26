/**
 * etaEngine.js — Recalculates ETAs on every GPS position update.
 * Feeds the Control Tower ShipmentEvent stream when integrated.
 */

const prisma = require('../lib/prisma');
const { calcDistanceMiles } = require('../lib/geo');

const AVG_SPEED_MPH = 55; // conservative average including stops

/**
 * Recalculate ETA for a load based on current truck position.
 */
async function recalcETA(loadId, currentLat, currentLng) {
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load || !load.deliveryLat || !load.deliveryLng) return null;

  const remainingMiles = calcDistanceMiles(currentLat, currentLng, load.deliveryLat, load.deliveryLng);
  const hoursRemaining = remainingMiles / AVG_SPEED_MPH;
  const eta            = new Date(Date.now() + hoursRemaining * 3600 * 1000);

  await prisma.load.update({ where: { id: loadId }, data: { eta } });

  // Push ShipmentEvent to Control Tower if integrated
  if (process.env.HAULSYNC_CT_URL) {
    await pushToControlTower(load, currentLat, currentLng, eta).catch(console.error);
  }

  return eta;
}

async function pushToControlTower(load, lat, lng, eta) {
  const event = {
    eventId:    require('uuid').v4(),
    source:     'haulsync-tms-dispatch',
    sourceRef:  load.id,
    occurredAt: new Date().toISOString(),
    shipment: {
      id:          load.ctShipmentId,
      reference:   load.loadNumber,
      origin:      { name: `${load.pickupCity}, ${load.pickupState}`, lat: load.pickupLat, lng: load.pickupLng },
      destination: { name: `${load.deliveryCity}, ${load.deliveryState}`, lat: load.deliveryLat, lng: load.deliveryLng },
      slaDeadline: load.slaDeadline?.toISOString() ?? null,
      transporter: { id: null, name: null },
      vehicle:     { id: load.truckId, regNo: null },
    },
    status: {
      code:     load.status === 'DELIVERED' ? 'DELIVERED' : 'IN_TRANSIT',
      location: { lat, lng },
      eta:      eta.toISOString(),
      odometer: null,
      message:  null,
    },
    meta: {},
  };

  await fetch(`${process.env.HAULSYNC_CT_URL}/api/ingest`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    process.env.HAULSYNC_CT_API_KEY || '',
    },
    body: JSON.stringify(event),
  });
}

module.exports = { recalcETA };
