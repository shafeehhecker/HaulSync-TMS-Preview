/**
 * matchingEngine.js — AI load-to-truck matching.
 *
 * Scores every available truck/driver pair against an incoming load
 * across four configurable factors and returns a ranked suggestion list.
 */

const prisma = require('../lib/prisma');
const { calcDistanceMiles } = require('../lib/geo');

const WEIGHTS = {
  distance:  parseFloat(process.env.MATCH_WEIGHT_DISTANCE  || '30'),
  hos:       parseFloat(process.env.MATCH_WEIGHT_HOS       || '25'),
  equipment: parseFloat(process.env.MATCH_WEIGHT_EQUIPMENT || '25'),
  backhaul:  parseFloat(process.env.MATCH_WEIGHT_BACKHAUL  || '20'),
};

const BACKHAUL_RADIUS = parseFloat(process.env.MATCH_BACKHAUL_RADIUS_MILES || '150');

// Equipment compatibility map — which truck types can carry which load equipment needs
const EQUIPMENT_COMPAT = {
  DRY_VAN:     ['DRY_VAN', 'CONESTOGA'],
  REEFER:      ['REEFER'],
  FLATBED:     ['FLATBED', 'STEP_DECK', 'LOWBOY', 'CONESTOGA'],
  STEP_DECK:   ['STEP_DECK', 'FLATBED'],
  TANKER:      ['TANKER'],
  LOWBOY:      ['LOWBOY'],
  CONESTOGA:   ['CONESTOGA', 'FLATBED'],
  CURTAIN_SIDE:['CURTAIN_SIDE', 'DRY_VAN'],
  BOX_TRUCK:   ['BOX_TRUCK'],
  SPRINTER:    ['SPRINTER', 'BOX_TRUCK'],
};

/**
 * Generate match suggestions for a given load.
 * @param {string} loadId
 * @returns {Promise<Array>} ranked suggestions saved to DB
 */
async function generateMatches(loadId) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: { truck: true, driver: true },
  });
  if (!load) throw new Error(`Load ${loadId} not found`);

  // Get all available trucks with their current driver
  const trucks = await prisma.truck.findMany({
    where: { status: 'AVAILABLE', isActive: true },
    include: {
      drivers: {
        where: { status: { in: ['AVAILABLE', 'ON_DUTY'] }, isActive: true },
        orderBy: { currentHosDriving: 'desc' },
        take: 1,
      },
    },
  });

  // Remove truck/driver already on this load
  const candidates = trucks.filter(t =>
    t.drivers.length > 0 &&
    t.id !== load.truckId
  );

  // Score each candidate
  const scored = await Promise.all(candidates.map(async (truck) => {
    const driver = truck.drivers[0];
    const factors = await scoreCandidate(load, truck, driver);
    const total   = Object.entries(factors).reduce((sum, [key, f]) => sum + (f.score * WEIGHTS[key] / 100), 0);
    return { truck, driver, factors, totalScore: Math.round(total * 100) / 100 };
  }));

  // Sort by score descending, keep top 5
  const ranked = scored
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 5);

  // Persist suggestions
  await prisma.matchSuggestion.deleteMany({ where: { loadId } });

  const saved = await Promise.all(ranked.map((s, idx) =>
    prisma.matchSuggestion.create({
      data: {
        loadId,
        truckId:        s.truck.id,
        driverId:       s.driver.id,
        rank:           idx + 1,
        totalScore:     s.totalScore,
        scoreFactors:   s.factors,
        distanceMiles:  s.factors.distance?.value ?? null,
        backhaulRevenue: s.factors.backhaul?.value ?? null,
      },
    })
  ));

  return saved.map((s, i) => ({ ...s, truck: ranked[i].truck, driver: ranked[i].driver }));
}

/**
 * Score one truck/driver pair against a load.
 * Returns per-factor { score (0-100), value, label }.
 */
async function scoreCandidate(load, truck, driver) {
  const factors = {};

  // ── 1. Distance factor ────────────────────────────────────────────────────
  let distanceMiles = null;
  if (truck.currentLat && truck.currentLng && load.pickupLat && load.pickupLng) {
    distanceMiles = calcDistanceMiles(
      truck.currentLat, truck.currentLng,
      load.pickupLat, load.pickupLng
    );
  }
  factors.distance = {
    score: distanceMiles == null ? 50 : Math.max(0, 100 - (distanceMiles / 3)),
    value: distanceMiles,
    label: distanceMiles != null ? `${Math.round(distanceMiles)} mi away` : 'Unknown',
  };

  // ── 2. HOS factor ─────────────────────────────────────────────────────────
  const hosDriving = driver.currentHosDriving ?? 11;
  const hosScore   = Math.min(100, (hosDriving / 11) * 100);
  factors.hos = {
    score: hosScore,
    value: hosDriving,
    label: `${hosDriving.toFixed(1)} hrs HOS`,
  };

  // ── 3. Equipment match factor ─────────────────────────────────────────────
  // If load has no equipment requirement, full marks; else check compat map
  let equipScore = 100;
  if (load.truckType) {
    const compatible = EQUIPMENT_COMPAT[load.truckType] || [load.truckType];
    equipScore = compatible.includes(truck.type) ? 100 : 0;
  }
  factors.equipment = {
    score: equipScore,
    value: truck.type,
    label: truck.type.replace(/_/g, ' '),
  };

  // ── 4. Backhaul value factor ──────────────────────────────────────────────
  let backhaulRevenue = 0;
  if (load.deliveryLat && load.deliveryLng) {
    const opps = await prisma.backhaulOpportunity.findMany({
      where: { capturedAt: null, surfacedForLoadId: { not: load.id } },
    });
    const nearby = opps.filter(opp => {
      if (!opp.originLat || !opp.originLng) return false; // simplified — store coords in future
      return true; // placeholder: all opps count
    });
    if (nearby.length) backhaulRevenue = nearby[0].estimatedRevenue;
  }
  const bhScore = Math.min(100, (backhaulRevenue / 2000) * 100);
  factors.backhaul = {
    score: bhScore,
    value: backhaulRevenue,
    label: backhaulRevenue > 0 ? `Backhaul +$${Math.round(backhaulRevenue)}` : 'No backhaul',
  };

  return factors;
}

module.exports = { generateMatches, scoreCandidate };
