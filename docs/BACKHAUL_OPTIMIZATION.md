# HaulSync TMS Dispatch — Backhaul Optimization

**Relevant files**:  
`backend/src/engines/matchingEngine.js` — backhaul factor scoring  
`backend/prisma/schema.prisma` — `BackhaulOpportunity` model

---

## What it does

The backhaul engine surfaces return-load opportunities at the moment a dispatcher assigns a truck to a load. The goal is to reduce deadhead miles on the return leg — every empty return mile is lost revenue.

The backhaul factor is the fourth input to the matching engine (default weight: 20%). A truck headed to a delivery destination that has a paying return load nearby scores higher than an identical truck without one.

---

## Current implementation

The `BackhaulOpportunity` model stores open loads near delivery destinations:

```prisma
model BackhaulOpportunity {
  id               String    @id @default(uuid())
  originCity       String
  originState      String
  destCity         String
  destState        String
  estimatedRevenue Float
  loadId           String?   // linked load if booked
  surfacedForLoadId String   // which load surfaced this opportunity
  radiusMiles      Float
  capturedAt       DateTime? // null = still open
  createdAt        DateTime  @default(now())
}
```

During matching engine scoring, the backhaul factor queries all uncaptured opportunities:

```javascript
const opps = await prisma.backhaulOpportunity.findMany({
  where: { capturedAt: null, surfacedForLoadId: { not: load.id } },
});
```

If any are found, the first opportunity's `estimatedRevenue` is used to calculate the backhaul score:

```javascript
const bhScore = Math.min(100, (backhaulRevenue / 2000) * 100);
```

A $2,000 opportunity scores 100. A $1,000 opportunity scores 50.

**Current limitation**: The query does not yet filter by proximity to the delivery destination. All uncaptured opportunities are returned and the first one is used. This means the backhaul factor currently functions as a signal that *some* backhaul opportunity exists in the system, not that one is near this specific delivery. Coordinate-based filtering is the immediate next improvement — see below.

---

## Scoring model

| Opportunity revenue | Backhaul score |
|---------------------|----------------|
| $0 (none found) | 0 |
| $500 | 25 |
| $1,000 | 50 |
| $1,500 | 75 |
| $2,000+ | 100 (capped) |

The $2,000 cap can be adjusted by changing the divisor in `matchingEngine.js`. For carriers with higher average rates, increase it proportionally.

---

## Adding coordinate-based proximity filtering

The immediate improvement is to store coordinates on `BackhaulOpportunity` and filter by Haversine distance during matching. Steps:

### 1. Extend the schema

```prisma
model BackhaulOpportunity {
  // ... existing fields ...
  originLat  Float?
  originLng  Float?
  destLat    Float?
  destLng    Float?
}
```

Run `npx prisma migrate dev --name add-backhaul-coords`.

### 2. Update the matching engine

Replace the current placeholder query with a distance-filtered query:

```javascript
// In scoreCandidate(), backhaul factor:
const { calcDistanceMiles } = require('../lib/geo');
const radius = parseFloat(process.env.MATCH_BACKHAUL_RADIUS_MILES || '150');

const opps = await prisma.backhaulOpportunity.findMany({
  where: {
    capturedAt: null,
    surfacedForLoadId: { not: load.id },
    originLat: { not: null },
    originLng: { not: null },
  },
});

// Filter by distance from delivery destination
const nearby = opps.filter(opp =>
  calcDistanceMiles(load.deliveryLat, load.deliveryLng, opp.originLat, opp.originLng)
  <= radius
);

// Sort by revenue descending, use the best opportunity
nearby.sort((a, b) => b.estimatedRevenue - a.estimatedRevenue);
const backhaulRevenue = nearby[0]?.estimatedRevenue ?? 0;
```

### 3. Add a route to create opportunities

```javascript
// POST /api/backhaul/opportunities
router.post('/', authenticate, async (req, res, next) => {
  const opp = await prisma.backhaulOpportunity.create({ data: req.body });
  res.status(201).json(opp);
});
```

---

## Feeding opportunities into the system

Opportunities can come from multiple sources. In priority order:

**Load board integration** — connect to a freight load board API (DAT, Truckstop, etc.) and populate `BackhaulOpportunity` records automatically near delivery destinations after each dispatch. This gives real market data and live rates.

**Manual entry by dispatcher** — a dispatcher who spots a return load can add it through the UI or API before assigning the outbound load.

**Internal loads** — when a new load is created with a pickup location near another load's delivery point, automatically create a `BackhaulOpportunity` record linking them. This works well for carriers with dense lane networks.

---

## Opportunity lifecycle

```
Created (capturedAt: null)
    │
    ├── Surfaced in matching suggestions
    │       scoreFactors.backhaul = { score: 75, value: 1500, label: "Backhaul +$1,500" }
    │
    ├── Dispatcher assigns the load (accepting the backhaul suggestion)
    │
    ▼
Captured (capturedAt: DateTime, loadId: linked load)
    │
    ▼
Excluded from future scoring (WHERE capturedAt: null)
```

To mark an opportunity as captured when a load is assigned:

```javascript
// In POST /api/loads/:id/assign, after assignment:
await prisma.backhaulOpportunity.updateMany({
  where: {
    surfacedForLoadId: req.params.id,
    capturedAt: null,
  },
  data: {
    capturedAt: new Date(),
    loadId: returnLoadId,  // if you know which load is the return
  },
});
```

---

## Analytics

Once `capturedAt` is populated on taken opportunities, you can measure backhaul capture rate:

```javascript
const total   = await prisma.backhaulOpportunity.count();
const captured= await prisma.backhaulOpportunity.count({ where: { capturedAt: { not: null } } });
const captureRate = Math.round((captured / total) * 100);
// e.g. "62% of surfaced opportunities were booked"
```

And revenue impact:
```javascript
const revenueCapture = await prisma.backhaulOpportunity.aggregate({
  where: { capturedAt: { not: null } },
  _sum: { estimatedRevenue: true },
});
// Total incremental revenue from backhaul optimization
```

Add these to `GET /api/analytics/dashboard` to surface them on the dispatch dashboard.

---

## Integration with Control Tower

When `HAULSYNC_CT_URL` is set, the ETA engine pushes a `ShipmentEvent` on every GPS update. The Control Tower's disruption engine can detect if a truck deviates significantly from the expected delivery-to-backhaul-origin route — raising an alert if the driver is heading the wrong direction after delivery.

This requires the Control Tower to know the backhaul route. The simplest integration is to create the backhaul load in TMS Dispatch and let the ETA engine push its `ShipmentEvent` like any other load.
