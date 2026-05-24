# HaulSync TMS Dispatch — API Reference

Base URL: `http://localhost:5004`
All endpoints except `/health` and `POST /api/hos/eld/webhook` require `Authorization: Bearer <token>`.

---

## Authentication

### POST `/api/auth/login`
**Request** `{ "email": "...", "password": "..." }`
**Response 200** `{ "token": "eyJ...", "user": { id, name, email, role, carrierId, carrier } }`
**Errors** 400 missing fields · 401 invalid credentials

### GET `/api/auth/me`
Returns the authenticated user's profile.

### POST `/api/auth/change-password`
**Request** `{ "currentPassword": "...", "newPassword": "..." }`
**Errors** 400 wrong current password

---

## Loads

### GET `/api/loads`
Query params: `status` (comma-separated), `driverId`, `truckId`, `page` (default 1), `limit` (default 50).
DRIVER role sees only their own loads.
**Response** `{ loads: [...], total, page, limit }`

Each load includes embedded `truck`, `driver`, `shipper`.

### GET `/api/loads/:id`
Full detail — includes `trackingEvents`, `documents`, `matchSuggestions`, open `hosAlerts`.

### POST `/api/loads`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER, OPERATOR
Required minimum: `pickupAddress`, `pickupCity`, `pickupState`, `deliveryAddress`, `deliveryCity`, `deliveryState`.
Auto-generates match suggestions after creation. Emits `load:created` socket event.
**Response 201** created Load object.

### PATCH `/api/loads/:id`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER, OPERATOR
Update any load fields.

### POST `/api/loads/:id/assign`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER
**Request** `{ "truckId": "uuid", "driverId": "uuid" }`
Sets load→ASSIGNED, truck→ON_LOAD, driver→ON_DUTY. Marks the accepted MatchSuggestion.
Emits `load:assigned` socket event.
**Errors** 400 missing IDs · 404 truck/driver not found

### PATCH `/api/loads/:id/status`
**Request** `{ "status": "AT_PICKUP", "lat": 41.85, "lng": -87.64, "notes": "..." }`
Valid statuses: UNASSIGNED → ASSIGNED → AT_PICKUP → IN_TRANSIT → AT_DELIVERY → DELIVERED → POD_PENDING → COMPLETED
When lat/lng present: appends LoadTrackingEvent, recalculates ETA, optionally pushes ShipmentEvent to Control Tower.
Emits `load:statusUpdate` to `load_{id}` room.

### POST `/api/loads/:id/matches`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER
Regenerates AI match suggestions (deletes existing, re-scores fleet).
Emits `match:suggested` socket event.

### DELETE `/api/loads/:id`
**Roles** SUPER_ADMIN, ADMIN
Sets status to CANCELLED.

---

## Documents (BOL)

### POST `/api/documents/upload`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER, OPERATOR
**Request** multipart/form-data: `file` (JPEG/PNG/WEBP/TIFF/PDF, max 10 MB), optional `type`, `loadId`.
AI extraction runs asynchronously. Poll GET /api/documents/:id every 2 s until aiStatus ≠ PENDING.
**Response 201** `{ document: { id, type, originalName, aiStatus: "PENDING" }, message }`
Socket event `document:extracted` fires when done.

### GET `/api/documents/:id`
Returns document with `aiExtracted` JSON, `aiConfidence` (0–1), `aiStatus`, `aiModel`, `extractedAt`.

### POST `/api/documents/:id/review`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER, OPERATOR
**Request** `{ "correctedFields": { bolNumber, weightLbs, ... }, "loadId": "uuid" }`
Diffs correctedFields vs aiExtracted, stores delta, feeds correctionStore for future prompt improvement.
Sets aiStatus → REVIEWED.

---

## HOS Monitoring

### GET `/api/hos/drivers`
Query params: `status`. Returns all drivers sorted by `currentHosDriving` ASC (lowest remaining first).
Includes active load and unread alerts per driver.

### GET `/api/hos/alerts`
All unread HOSAlerts with embedded driver and load.

### POST `/api/hos/drivers/:id/update`
Manual HOS update. Same code path as ELD webhook but source=MANUAL.
**Request** any ELDEvent fields: `eventType`, `drivingHoursRemaining`, `onDutyHoursRemaining`, `weeklyHoursRemaining`.
Triggers immediate HOS evaluation.

### POST `/api/hos/eld/webhook`
**No auth required** — secure at network level.
Query param: `provider` (samsara/motive/etc., falls back to DEFAULT_ELD_PROVIDER env var).
Normalises via adapter → applyELDEvent → evaluateDriver. Full path < 100 ms.
**Response 200** `{ "received": true }`
**Errors** 400 if normalised event lacks driverId

### PATCH `/api/hos/alerts/:id/read`
Marks alert as read.

### POST `/api/hos/drivers/:id/evaluate`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER
Manually triggers evaluation for one driver. Returns any new alerts raised.

---

## Fleet

### GET `/api/fleet/trucks`
Query params: `status`, `type`. Returns active trucks with current driver and active load.

### GET `/api/fleet/trucks/:id`
Full detail with driver list and last 10 loads.

### POST `/api/fleet/trucks`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER
Required: `unitNumber`, `type`.

### PATCH `/api/fleet/trucks/:id`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER

### PATCH `/api/fleet/trucks/:id/location`
**Request** `{ "lat": 41.878, "lng": -87.629, "location": "Chicago, IL" }`
Emits `truck:locationUpdate` socket event.

### GET `/api/fleet/drivers`
Query param: `status`.

### GET `/api/fleet/drivers/:id`
With last 10 loads, 10 HOS alerts, 20 HOS log entries.

### POST `/api/fleet/drivers`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER
Required: `name`. HOS counters default to US_PROPERTY limits.

### PATCH `/api/fleet/drivers/:id`
**Roles** SUPER_ADMIN, ADMIN, DISPATCHER

---

## Analytics

### GET `/api/analytics/dashboard`
Single-request KPI snapshot.
**Response** `{ loads: { total, unassigned, inTransit, deliveredToday }, fleet: { available, onLoad, utilization }, hos: { alerts, violations }, ai: { avgBOLConfidence } }`
`utilization` = `Math.round(onLoad / (onLoad + available) * 100)`

### GET `/api/analytics/loads`
Query param: `days` (default 30). Daily time-series grouped by date.
**Response** `[{ date, count, revenue, miles }]` sorted ascending.

### GET `/api/analytics/drivers`
Top 20 drivers by total loads. Includes violations count, totalMiles, totalRevenue, rating.

---

## Users (admin only)

### GET `/api/users` — all users. **Roles** SUPER_ADMIN, ADMIN
### POST `/api/users` — create user. Password is bcrypt-hashed. Required: `name`, `email`, `password`, `role`.
### PATCH `/api/users/:id` — update user. Password re-hashed if included.

---

## Health

### GET `/health`
No auth. Returns `{ status: "ok", service: "HaulSync TMS Dispatch API", version: "1.0.0" }`.

---

## Socket.io

Authenticate: pass JWT in handshake auth.
```javascript
const socket = io('http://localhost:5004', { auth: { token: yourJWT } });
socket.emit('join_load',  loadId);   // subscribe to per-load updates
socket.emit('leave_load', loadId);
```

| Event | Payload |
|-------|---------|
| `load:created` | `{ id, loadNumber, status }` |
| `load:assigned` | `{ loadId, truckId, driverId, dispatchedAt }` |
| `load:statusUpdate` | `{ loadId, status, lat, lng }` |
| `truck:locationUpdate` | `{ truckId, lat, lng, location }` |
| `hos:alert` | `{ driverId, truckId, alertType, minutesRemaining, message }` |
| `hos:violation` | `{ driverId, truckId, ruleViolated, message }` |
| `match:suggested` | `{ loadId, suggestions[] }` |
| `document:extracted` | `{ documentId, extracted, confidence }` |

---

## Error format
All errors: `{ "message": "description" }`. In development adds `stack`.

## Role permissions

| Group | SUPER_ADMIN | ADMIN | DISPATCHER | OPERATOR | DRIVER | FINANCE | VIEWER |
|-------|:-----------:|:-----:|:----------:|:--------:|:------:|:-------:|:------:|
| Auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Loads read | ✅ | ✅ | ✅ | ✅ | own | ✅ | ✅ |
| Loads write | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Loads assign | ✅ | ✅ | ✅ | — | — | — | — |
| Documents | ✅ | ✅ | ✅ | ✅ | — | — | — |
| HOS read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HOS evaluate | ✅ | ✅ | ✅ | — | — | — | — |
| Fleet read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fleet write | ✅ | ✅ | ✅ | — | — | — | — |
| Analytics | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Users | ✅ | ✅ | — | — | — | — | — |
