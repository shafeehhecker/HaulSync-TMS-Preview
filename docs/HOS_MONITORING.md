# HaulSync TMS Dispatch — HOS Monitoring

**File**: `backend/src/engines/hosEngine.js`

---

## What it does

Continuously evaluates every active driver's HOS state and raises alerts **before** violations occur. A dispatcher gets a warning 45 minutes before a driver hits their daily limit — enough time to plan a swap, a stop, or a re-route.

---

## Supported rule sets

Assigned per driver via `driver.hosRuleSet`. Change at any time with `PATCH /api/fleet/drivers/:id`.

| Rule set | Max driving | Max on-duty | Max weekly | Break after |
|----------|-------------|-------------|------------|-------------|
| `US_PROPERTY` | 11 h | 14 h | 70 h / 8-day | 8 h continuous |
| `US_PASSENGER` | 10 h | 15 h | 60 h / 7-day | 8 h continuous |
| `CANADA` | 13 h | 14 h | 70 h / 7-day | 8 h continuous |
| `CANADA_NORTH` | 15 h | 18 h | 80 h / 7-day | 8 h continuous |

---

## Alert types

| Type | Trigger |
|------|---------|
| `HOS_WARNING` | `currentHosDriving ≤ WARNING_BUFFER` (default 45 min) and > 0 |
| `BREAK_REQUIRED` | Continuous driving approaching `breakAfter` threshold |
| `WEEKLY_LIMIT_WARNING` | `currentHosWeekly ≤ HOS_WEEKLY_WARNING_HOURS` (default 10 h) |
| `SLEEPER_SPLIT_RISK` | Defined in schema — not yet evaluated (future) |
| `VIOLATION_DETECTED` | `currentHosDriving ≤ 0` — also sets `driver.status = 'VIOLATION'` |

---

## Engine lifecycle

Bootstrapped in `server.js`:
```javascript
hosEngine.setSocketIO(io);
hosEngine.startPolling();   // 5-minute setInterval
```

**5-minute polling**: `evaluateAll()` fetches all ON_DUTY/AVAILABLE drivers, evaluates each sequentially (not parallel — avoids DB contention).

**Immediate evaluation**: `applyELDEvent()` calls `evaluateDriver()` right after writing ELD data. Alert latency after an ELD update: < 100 ms.

---

## Evaluation sequence (per driver)

1. **Driving hours warning** — `drivingRemaining ≤ 0.75 h` → `HOS_WARNING`
2. **Violation** — `drivingRemaining ≤ 0` → `VIOLATION_DETECTED` + update driver status
3. **Break required** — walks last 20 DRIVING log entries backwards, sums `durationMin/60` until a non-DRIVING event, compares against `breakAfter - WARNING_BUFFER`
4. **Weekly warning** — `weeklyRemaining ≤ 10 h` → `WEEKLY_LIMIT_WARNING`

**Deduplication**: before persisting, checks for an existing unread alert of the same type for the same driver within the last 30 minutes. Prevents alert storms from rapid ELD updates.

---

## Real-time alerts

Every new alert (post-dedup) emits a Socket.io event:
- `VIOLATION_DETECTED` → `hos:violation`
- All others → `hos:alert`

Payload includes `driverId`, `truckId`, and the full alert record. The HOS monitor page subscribes to both and refreshes on receipt.

---

## HOS data sources

The engine reads `driver.currentHosDriving`, `currentHosOnDuty`, `currentHosWeekly` directly. Three ways to keep these accurate:

1. **ELD webhook** (real-time) — `POST /api/hos/eld/webhook` → adapter normalises → `applyELDEvent` writes counters
2. **Manual update** — `POST /api/hos/drivers/:id/update` — driver or dispatcher submits hours
3. **GPS inference** — not yet implemented; can be added by decrementing counters based on truck motion events

---

## Extending to new rule sets

1. Add enum value to `HOSRuleSet` in `schema.prisma`
2. Add entry to `HOS_RULES` in `hosEngine.js`:
   ```javascript
   EU_EC561: { maxDriving: 9, maxOnDuty: 13, maxWeekly: 56, breakAfter: 4.5 }
   ```
3. Run `npx prisma migrate dev`
4. Assign drivers `hosRuleSet: 'EU_EC561'`

The evaluation logic applies the correct rule set per driver automatically.
