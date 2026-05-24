# HaulSync TMS Dispatch — ELD Integration

**Files**:  
`backend/src/lib/eldAdapter.js` — provider registry and factory  
`backend/src/integrations/eld/` — one file per provider  
`backend/src/routes/hos.js` — webhook endpoint

---

## Overview

ELD data enters the system through a single endpoint: `POST /api/hos/eld/webhook`. Regardless of which provider sends it, the payload is normalised into one canonical shape — the `ELDEvent` — before the HOS engine processes it. This means the HOS engine, matching engine, and alert system have zero knowledge of any specific ELD provider.

Adding a new provider is one file in `integrations/eld/` plus one line in `eldAdapter.js`. No other code changes are needed.

---

## Supported providers

| Provider | Key | Status |
|----------|-----|--------|
| Samsara | `samsara` | ✅ Adapter implemented |
| Motive (ex-KeepTruckin) | `motive` | Stub — implement `normalise()` |
| Omnitracs | `omnitracs` | Stub |
| Geotab | `geotab` | Stub |
| PeopleNet | `peoplenet` | Stub |
| BigRoad | `bigroad` | Stub |
| Custom webhook | `webhook` | Pass-through (canonical shape required) |
| Manual entry | `manual` | Pass-through (default) |

Stubs export an empty `normalise()` — they compile and load, but will not transform data correctly until implemented. See the Samsara adapter as the reference implementation.

---

## Canonical ELDEvent shape

Every adapter must return an object matching this shape. Fields marked optional can be `null` or omitted.

```javascript
{
  driverId:              String,   // REQUIRED — maps to driver.id in the DB
  truckId:               String,   // optional — maps to truck.id
  eventType:             String,   // REQUIRED: ON_DUTY | OFF_DUTY | DRIVING | SLEEPER | PC | YM
  startAt:               String,   // optional — ISO 8601
  endAt:                 String,   // optional — ISO 8601
  durationMin:           Number,   // optional — used for continuous driving calculation
  drivingHoursRemaining: Number,   // optional — hours, e.g. 9.2
  onDutyHoursRemaining:  Number,   // optional — hours
  weeklyHoursRemaining:  Number,   // optional — hours
  lat:                   Number,   // optional — decimal degrees
  lng:                   Number,   // optional — decimal degrees
  location:              String,   // optional — human-readable "City, ST"
  source:                String,   // REQUIRED: 'SAMSARA' | 'MOTIVE' | 'WEBHOOK' | 'MANUAL' etc.
}
```

**Critical**: `driverId` must be your internal database driver UUID, not the provider's driver ID. The adapter is responsible for this mapping. The simplest approach is to store the provider's driver ID in a `Driver.eldDeviceId` field and look it up in the adapter. The Samsara adapter currently expects `raw.driverId` to already be set by a pre-processing step in your webhook receiver — see the webhook setup section below.

---

## Provider registry

`backend/src/lib/eldAdapter.js`:

```javascript
const PROVIDERS = {
  samsara:   () => require('../integrations/eld/samsara'),
  motive:    () => require('../integrations/eld/motive'),
  omnitracs: () => require('../integrations/eld/omnitracs'),
  geotab:    () => require('../integrations/eld/geotab'),
  peoplenet: () => require('../integrations/eld/peoplenet'),
  bigroad:   () => require('../integrations/eld/bigroad'),
  webhook:   () => require('../integrations/eld/webhook'),
  manual:    () => require('../integrations/eld/manual'),
};

function getAdapter(provider) {
  const key     = (provider || process.env.DEFAULT_ELD_PROVIDER || 'manual').toLowerCase();
  const factory = PROVIDERS[key] || PROVIDERS.manual;
  return factory();
}
```

The factory pattern (returning a function that `require()`s) means adapters are loaded lazily — only when that provider is used. Unused providers are not loaded into memory.

---

## Webhook endpoint

```
POST /api/hos/eld/webhook?provider=samsara
```

No authentication is required — the endpoint is secured at the network level. ELD providers send to a public URL; protect it with your firewall or load balancer by allowing only the provider's IP ranges.

The route selects the adapter based on the `provider` query parameter, falling back to `DEFAULT_ELD_PROVIDER` env var, then to `manual`:

```javascript
const provider = req.query.provider || process.env.DEFAULT_ELD_PROVIDER || 'manual';
const adapter  = eldAdapter.getAdapter(provider);
const event    = adapter.normalise(req.body);
```

After normalisation, `applyELDEvent` writes the data to the database and triggers immediate HOS evaluation. The entire path from webhook receipt to alert emission takes under 100ms on typical hardware.

---

## Samsara integration

**Reference implementation**: `backend/src/integrations/eld/samsara.js`

### Adapter

The Samsara adapter normalises the HOS webhook payload:

```javascript
function normalise(raw) {
  const hos = raw.data?.hosStatus || {};
  return {
    driverId:              raw.driverId,   // set by your webhook receiver (see below)
    truckId:               raw.truckId ?? null,
    eventType:             mapDutyStatus(hos.currentDutyStatus),
    startAt:               hos.cycleStartTime ?? null,
    drivingHoursRemaining: hos.timeUntilBreak        != null ? hos.timeUntilBreak / 3600        : null,
    onDutyHoursRemaining:  hos.shiftDriveRemaining   != null ? hos.shiftDriveRemaining / 3600   : null,
    weeklyHoursRemaining:  hos.cycleRemaining         != null ? hos.cycleRemaining / 3600         : null,
    lat:                   raw.data?.location?.latitude  ?? null,
    lng:                   raw.data?.location?.longitude ?? null,
    location:              raw.data?.location?.reverseGeo?.formattedLocation ?? null,
    source:                'SAMSARA',
  };
}
```

Samsara sends time values in seconds — the adapter divides by 3600 to convert to hours before passing to the engine.

Duty status mapping:
```javascript
const map = {
  off_duty:            'OFF_DUTY',
  sleeper_bed:         'SLEEPER',
  driving:             'DRIVING',
  on_duty:             'ON_DUTY',
  personal_conveyance: 'PC',
  yard_moves:          'YM',
};
```

### Driver ID mapping

Samsara uses its own driver IDs. Your webhook receiver must map them to internal UUIDs before the payload reaches the adapter. The recommended pattern:

1. Add a `eldExternalId` field to the `Driver` model in `schema.prisma`
2. When creating or importing drivers, store the Samsara driver ID there
3. In a thin pre-processing layer in `src/routes/hos.js`, look up the internal ID:

```javascript
// In the webhook route, before calling adapter.normalise():
const samsaraDriverId = req.body.data?.driver?.id;
const driver = await prisma.driver.findFirst({
  where: { eldExternalId: samsaraDriverId }
});
req.body.driverId = driver?.id ?? null;
```

### Samsara webhook configuration

In your Samsara fleet portal:

1. Go to **Developer Tools → Webhooks**
2. Create a new webhook:
   - URL: `https://your-domain/api/hos/eld/webhook?provider=samsara`
   - Events: `HOS status updates`, `Location updates`
   - Authentication: IP allowlist (Samsara publishes their IP ranges)
3. Test with a sandbox driver and verify the logs in `docker compose logs -f backend`

---

## Implementing a new provider adapter

Create `backend/src/integrations/eld/yourprovider.js`:

```javascript
/**
 * yourprovider.js — ELD adapter for YourProvider.
 * Docs: https://docs.yourprovider.com/webhooks
 */

function normalise(raw) {
  return {
    driverId:              lookupDriverId(raw.driver_id),   // map to internal UUID
    truckId:               lookupTruckId(raw.vehicle_id),
    eventType:             mapStatus(raw.duty_status),
    startAt:               raw.event_time ?? null,          // ISO 8601
    durationMin:           raw.duration_seconds != null ? raw.duration_seconds / 60 : null,
    drivingHoursRemaining: raw.drive_remaining_seconds != null ? raw.drive_remaining_seconds / 3600 : null,
    onDutyHoursRemaining:  raw.duty_remaining_seconds  != null ? raw.duty_remaining_seconds  / 3600 : null,
    weeklyHoursRemaining:  raw.cycle_remaining_seconds  != null ? raw.cycle_remaining_seconds  / 3600 : null,
    lat:                   raw.lat ?? null,
    lng:                   raw.lng ?? null,
    location:              raw.location_name ?? null,
    source:                'YOURPROVIDER',
  };
}

function mapStatus(status) {
  const map = {
    'off':      'OFF_DUTY',
    'sleeper':  'SLEEPER',
    'driving':  'DRIVING',
    'on_duty':  'ON_DUTY',
  };
  return map[status] || 'ON_DUTY';
}

// These functions should query the DB or a local cache
async function lookupDriverId(externalId) { /* ... */ }
async function lookupTruckId(externalId)  { /* ... */ }

module.exports = { normalise };
```

Then register it in `backend/src/lib/eldAdapter.js`:

```javascript
const PROVIDERS = {
  // ... existing providers ...
  yourprovider: () => require('../integrations/eld/yourprovider'),
};
```

Set `DEFAULT_ELD_PROVIDER=yourprovider` in `.env` and restart. Done.

---

## Manual / webhook mode

For carriers without an ELD integration, two paths are available:

**Driver manual entry** — drivers submit their HOS via the API:
```bash
POST /api/hos/drivers/:id/update
{
  "eventType": "DRIVING",
  "drivingHoursRemaining": 6.5,
  "onDutyHoursRemaining": 8.0,
  "weeklyHoursRemaining": 42.0
}
```

**Generic webhook** — any system that can post JSON can use the `webhook` provider. The payload must already be in canonical `ELDEvent` shape — the `webhook` adapter is a pass-through normaliser.

---

## Testing ELD integration

Send a test event directly to the webhook endpoint with curl:

```bash
curl -X POST "http://localhost:5004/api/hos/eld/webhook?provider=manual" \
  -H "Content-Type: application/json" \
  -d '{
    "driverId": "your-driver-uuid",
    "truckId": "your-truck-uuid",
    "eventType": "DRIVING",
    "drivingHoursRemaining": 0.5,
    "onDutyHoursRemaining": 1.5,
    "weeklyHoursRemaining": 38.0,
    "source": "MANUAL"
  }'
```

With `drivingHoursRemaining: 0.5` (30 minutes) and `HOS_WARNING_BUFFER_MINUTES=45`, this should immediately produce a `HOS_WARNING` alert visible in `GET /api/hos/alerts` and a `hos:alert` Socket.io event.

Check backend logs for the full evaluation trace:
```bash
docker compose logs -f backend
```
