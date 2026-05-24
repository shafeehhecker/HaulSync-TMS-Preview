# HaulSync TMS Dispatch — Matching Engine

**File**: `backend/src/engines/matchingEngine.js`

---

## What it does

Scores every available truck/driver pair against an incoming load across four weighted factors, returns a ranked list of up to five suggestions. Runs in-process — no external ML calls. Deterministic and configurable via environment variables.

---

## When it runs

- **Automatically** — on `POST /api/loads` (new load created)
- **On demand** — `POST /api/loads/:id/matches` (dispatcher-triggered)

Existing suggestions are deleted and re-inserted on each run.

---

## Scoring formula

```
totalScore = (distanceScore  × WEIGHT_DISTANCE  / 100)
           + (hosScore        × WEIGHT_HOS        / 100)
           + (equipmentScore  × WEIGHT_EQUIPMENT   / 100)
           + (backhaulScore   × WEIGHT_BACKHAUL    / 100)
```

Default weights (configurable, should sum to 100):

| Factor | Default | Env var |
|--------|---------|---------|
| Distance | 30 | `MATCH_WEIGHT_DISTANCE` |
| HOS remaining | 25 | `MATCH_WEIGHT_HOS` |
| Equipment match | 25 | `MATCH_WEIGHT_EQUIPMENT` |
| Backhaul value | 20 | `MATCH_WEIGHT_BACKHAUL` |

---

## Factor scoring

### 1. Distance (0–100)
Haversine from truck's GPS to load pickup. `score = Math.max(0, 100 - (miles / 3))`.
Score 100 at 0 mi, ~0 at 300 mi. Defaults to 50 if truck has no GPS coordinates.

| Miles | Score |
|-------|-------|
| 0 | 100 | 30 | 90 | 75 | 75 | 150 | 50 | 300 | 0 |

### 2. HOS remaining (0–100)
`score = Math.min(100, (currentHosDriving / 11) * 100)`
Full 11 hours = 100. Selects the driver with most HOS remaining per truck.

### 3. Equipment match (0 or 100)
Binary. If load has no equipment requirement → all trucks score 100.
If incompatible → score 0 (truck can still appear in suggestions if other factors are strong).

Compatibility map (abridged):
- `DRY_VAN` → DRY_VAN, CONESTOGA
- `REEFER` → REEFER only
- `FLATBED` → FLATBED, STEP_DECK, LOWBOY, CONESTOGA
- `TANKER` → TANKER only

### 4. Backhaul value (0–100)
`score = Math.min(100, (backhaulRevenue / 2000) * 100)`
Queries uncaptured `BackhaulOpportunity` records. $2,000 = score 100. See `BACKHAUL_OPTIMIZATION.md`.

---

## Result storage

Top 5 stored in `match_suggestions` with `scoreFactors` JSON per factor:
```json
{
  "distance":  { "score": 98, "value": 6.2,    "label": "6 mi away" },
  "hos":       { "score": 84, "value": 9.2,    "label": "9.2 hrs HOS" },
  "equipment": { "score": 100,"value": "DRY_VAN","label": "Dry Van" },
  "backhaul":  { "score": 0,  "value": 0,      "label": "No backhaul" }
}
```

When a dispatcher assigns the suggested truck/driver, `accepted: true` is set — this feeds acceptance rate analytics.

---

## Tuning for different operations

**Broker (minimise deadhead)** — `MATCH_WEIGHT_DISTANCE=40`, `MATCH_WEIGHT_BACKHAUL=10`
**High-volume reefer** — `MATCH_WEIGHT_EQUIPMENT=40`, `MATCH_WEIGHT_DISTANCE=20`
**Long-haul (backhaul critical)** — `MATCH_WEIGHT_BACKHAUL=35`, `MATCH_WEIGHT_HOS=15`

---

## Adding a new scoring factor

1. Add entry to `WEIGHTS` in `matchingEngine.js`
2. Add env var to `.env.example`
3. Add factor calculation to `scoreCandidate()` returning `{ score, value, label }`

The formula loop picks it up automatically. No route, schema, or UI changes needed — `scoreFactors` is a schema-less JSON column and the UI renders all factors dynamically.
