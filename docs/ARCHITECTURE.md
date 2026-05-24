# HaulSync TMS Dispatch — Architecture

## Overview

Node.js/Express backend + React SPA frontend. Route → engine → database layering: routes handle HTTP concerns, engines contain all business logic with no HTTP dependencies, Prisma handles all DB access.

## Directory layout

```
haulsync-tms-dispatch/
├── backend/
│   ├── server.js                   Entry — Express + Socket.io bootstrap
│   ├── src/
│   │   ├── routes/                 Thin HTTP handlers — delegate to engines
│   │   │   ├── auth.js
│   │   │   ├── loads.js
│   │   │   ├── documents.js
│   │   │   ├── fleet.js
│   │   │   ├── hos.js
│   │   │   ├── analytics.js
│   │   │   └── users.js
│   │   ├── engines/                Business logic — no HTTP dependencies
│   │   │   ├── bolReader.js        AI BOL extraction
│   │   │   ├── correctionStore.js  Dispatcher feedback persistence
│   │   │   ├── matchingEngine.js   Load-to-truck scoring
│   │   │   ├── hosEngine.js        HOS evaluation + alert lifecycle
│   │   │   └── etaEngine.js        ETA recalculation + CT push
│   │   ├── integrations/eld/       One file per ELD provider
│   │   ├── lib/
│   │   │   ├── prisma.js           Singleton Prisma client
│   │   │   ├── eldAdapter.js       Provider registry + factory
│   │   │   └── geo.js              Haversine formula
│   │   └── middleware/
│   │       ├── auth.js             JWT verify + RBAC
│   │       └── errorHandler.js
│   └── prisma/
│       ├── schema.prisma
│       └── seed.js
└── frontend/src/
    ├── App.jsx                     Router + auth guard
    ├── context/
    │   ├── AuthContext.jsx         Auth state + Socket.io connection
    │   └── ThemeContext.jsx        Dark/light toggle, localStorage
    ├── api/client.js               Axios + JWT interceptor
    ├── components/
    │   ├── Layout/Layout.jsx       Sidebar + nav + theme toggle
    │   └── common/index.jsx        Shared UI primitives
    └── pages/
        ├── Dashboard.jsx
        ├── Board/                  Kanban dispatch board
        ├── Loads/                  List + detail + assign
        ├── Documents/              BOL upload + review
        ├── HOS/                    Live HOS monitor
        ├── Trucks/ · Drivers/
        ├── Analytics/
        └── Users/
```

## Data model groups

**Identity** — `User`, `Carrier`, `Shipper`. Users belong to a Carrier. A User links 1:1 to a Driver for role-scoped load visibility.

**Fleet** — `Truck`, `Driver`. Trucks carry `currentLat/currentLng` for matching engine distance scoring. Drivers carry live HOS counters (`currentHosDriving`, `currentHosOnDuty`, `currentHosWeekly`) written by the ELD adapter and read by the HOS engine.

**Loads** — `Load`, `LoadTrackingEvent`. Loads carry full route with lat/lng, freight details, assignment, financials, and `ctShipmentId` for Control Tower integration.

**Documents** — `Document`. Stores file path + full AI extraction lifecycle: `aiStatus` PENDING → EXTRACTED → REVIEWED/REJECTED. `correctionDelta` records field-level diffs between AI output and dispatcher corrections.

**HOS** — `HOSLog`, `HOSAlert`. Logs written per ELD event. Alerts deduplicated within 30-minute window per driver per alert type.

**Matching** — `MatchSuggestion`, `BackhaulOpportunity`. Suggestions are delete+re-inserted on each generation. Per-factor score breakdown stored as JSON.

## Engine execution model

All engines are plain Node.js modules. No framework, no HTTP.

**bolReader** — called via `setImmediate` from the upload route so the HTTP response returns before extraction starts. Socket.io instance fetched from `req.app.get('io')` in the route.

**matchingEngine** — called automatically on load creation and on-demand. Fully in-process, no external ML calls.

**hosEngine** — only engine with its own lifecycle. Bootstrapped in `server.js`:
```javascript
hosEngine.setSocketIO(io);
hosEngine.startPolling();   // 5-minute setInterval
```
Also runs immediately on every `applyELDEvent` call.

**etaEngine** — called from `PATCH /api/loads/:id/status` when lat/lng present. Updates `load.eta` and pushes ShipmentEvent to Control Tower if `HAULSYNC_CT_URL` is set.

## Real-time

Socket.io shares the Node HTTP server. Authentication mirrors REST — JWT verified in handshake middleware. `io` stored on Express app object (`app.set('io', io)`) to avoid circular imports.

Two room types:
- `role:{roleName}` — automatic on connection
- `load_{id}` — client subscribes with `socket.emit('join_load', loadId)`

## Theme system

CSS custom properties in `src/index.css` under `:root` (dark default) and `.light`. ThemeContext toggles `.light` on `document.documentElement` and persists to `localStorage` under key `hs_theme` — consistent with PTL and Control Tower modules.

## Docker topology

```
postgres:5432 ← backend:5004 ← frontend:80 (Nginx)
```
Host ports: 5436 (postgres), 5004 (backend), 3004 (frontend).
Nginx proxies `/api/`, `/socket.io/`, `/uploads/` to `backend:5004` by container name.

Volumes: `postgres_data`, `bols_data` (uploads/bols/), `corrections_data` (uploads/corrections.json).

## HaulSync ecosystem integration

| Integration | Env var | Enables |
|-------------|---------|---------|
| HaulSync Core | `HAULSYNC_CORE_URL` | Shared carrier/truck/driver master |
| Control Tower | `HAULSYNC_CT_URL` | ShipmentEvent push on GPS updates |
| Fleet module | `HAULSYNC_FLEET_URL` | Behavior events and availability |

All optional. TMS Dispatch runs fully standalone when these are unset.
