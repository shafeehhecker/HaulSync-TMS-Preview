# 🚚 HaulSync — TMS Dispatch & Planning

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Part of HaulSync](https://img.shields.io/badge/HaulSync-TMS%20Dispatch-8B5CF6)](https://github.com/your-org/haulsync)

> **A self-hostable TMS Dispatch & Planning module — built on the HaulSync platform. Cuts dispatcher workload from 20 hours to 3 hours a week with AI-powered load matching, a unified dispatch board, and intelligent HOS monitoring.**

HaulSync TMS Dispatch is a dedicated module in the HaulSync ecosystem, purpose-built for FTL carriers, brokers, and fleet operators that need to eliminate manual dispatch work and drive fleet utilization higher. It ships as a standalone service that integrates seamlessly with the core HaulSync platform and plugs natively into the Fleet and Control Tower modules.

**The problem it solves:** Dispatchers spend 20+ hours a week on manual BOL entry, load-to-truck matching, and status tracking across 5+ disconnected systems. HaulSync TMS Dispatch replaces all of that with a single unified board, AI document reading, and proactive HOS alerting — reducing dispatch time by 65% and increasing fleet utilization by 15%.

---

## ✨ Module Overview

| Module | Description |
|--------|-------------|
| 🤖 **AI Document Reader** | Upload any BOL — handwritten, faxed, or PDF — and extract all load details in 30 seconds via AI |
| 🗂️ **Unified Dispatch Board** | Single real-time board for all trucks, loads, and assignments — drag-and-drop interface |
| ⚡ **AI Load-to-Truck Matching** | AI-suggested optimal truck assignments based on HOS, location, equipment, and backhaul |
| ⏱️ **HOS Monitoring & Alerts** | Proactive Hours of Service violation alerts 45 minutes before a driver goes out of compliance |
| 📋 **Load Management** | Full load lifecycle — create, assign, dispatch, track, and close with automated status updates |
| 🗺️ **Route Planning** | Optimized route suggestions with real-time traffic, ETA calculations, and stop sequencing |
| 🔁 **Backhaul Optimization** | Automatically surfaces backhaul opportunities when matching trucks to loads |
| 📊 **Dispatch Analytics** | Dispatcher productivity, fleet utilization, HOS compliance rates, and revenue-per-mile dashboards |

---

## 🏗️ Architecture

```
haulsync-tms-dispatch/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── loads.js               # Load CRUD, assignment, status lifecycle
│   │   │   ├── dispatch.js            # Dispatch board state, drag-and-drop events
│   │   │   ├── matching.js            # AI match suggestions endpoint
│   │   │   ├── hos.js                 # HOS log ingestion, violation detection
│   │   │   ├── documents.js           # BOL upload, AI extraction, correction loop
│   │   │   ├── routes.js              # Route planning, ETA, stop sequencing
│   │   │   ├── drivers.js             # Driver profiles, HOS state, availability
│   │   │   ├── trucks.js              # Truck master, equipment type, availability
│   │   │   ├── analytics.js           # Dispatch KPIs, utilization, compliance reports
│   │   │   ├── carriers.js            # Carrier/broker master
│   │   │   ├── users.js               # User management
│   │   │   └── auth.js                # Login, JWT
│   │   ├── engines/
│   │   │   ├── matchingEngine.js      # AI load-to-truck scoring & ranking logic
│   │   │   ├── hosEngine.js           # HOS rule evaluation & proactive alert scheduler
│   │   │   ├── backhaulEngine.js      # Backhaul opportunity detection
│   │   │   └── etaEngine.js           # ETA calculation with live traffic data
│   │   ├── ai/
│   │   │   ├── bolReader.js           # AI document extraction pipeline (BOL/POD)
│   │   │   ├── correctionStore.js     # Learns from dispatcher corrections over time
│   │   │   └── prompts/               # Extraction prompt templates per document type
│   │   ├── integrations/
│   │   │   ├── eld/                   # Pluggable ELD provider adapters
│   │   │   └── maps/                  # Map/routing provider adapters
│   │   ├── lib/
│   │   │   ├── eldAdapter.js          # ELD provider abstraction layer
│   │   │   └── mapsAdapter.js         # Routing provider abstraction layer
│   │   └── middleware/
│   │       ├── auth.js
│   │       └── errorHandler.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── uploads/bols/                  # Uploaded BOL images & PDFs
│   ├── uploads/documents/             # Driver and load documents
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx          # Live KPI summary
│       │   ├── Login.jsx
│       │   ├── DispatchBoard/         # Unified drag-and-drop dispatch board
│       │   ├── Loads/                 # Load list, creation, detail
│       │   ├── Matching/              # AI match suggestion UI
│       │   ├── HOS/                   # HOS monitor, driver hours, alerts
│       │   ├── Documents/             # BOL upload & AI extraction review
│       │   ├── Routes/                # Route planning & ETA tracker
│       │   ├── Drivers/               # Driver availability & profiles
│       │   ├── Trucks/                # Truck master & status
│       │   └── Analytics/             # Dispatch & utilization reports
│       ├── components/
│       │   ├── Layout/
│       │   ├── DispatchBoard/         # Board, lane, card components
│       │   └── common/
│       ├── api/client.js
│       └── context/AuthContext.jsx
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── BOL_READER.md
│   ├── MATCHING_ENGINE.md
│   ├── HOS_MONITORING.md
│   ├── ELD_INTEGRATION.md
│   └── BACKHAUL_OPTIMIZATION.md
├── docker-compose.yml
├── .env.example
├── CONTRIBUTING.md
└── LICENSE
```

**Tech Stack** — identical to the core HaulSync platform:

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 18, Express.js, Prisma ORM, PostgreSQL 15, Socket.io |
| **Frontend** | React 18, Vite, Tailwind CSS, React Router v6, Recharts |
| **Auth** | JWT + bcrypt (shared session with HaulSync core if co-deployed) |
| **Realtime** | Socket.io for live dispatch board updates, HOS alerts, and ETA push |
| **AI** | OpenAI-compatible endpoint for BOL extraction and match scoring |
| **Infra** | Docker, Docker Compose, Nginx (reverse proxy) |

---

## 🔄 Dispatch Lifecycle — How It Works

```
BOL Received (image, fax scan, or PDF)
      │
      ▼
AI Document Reader — extracts pickup, delivery, commodity, weight, instructions
      │
      ▼
Load Created in System (30 seconds vs. 5 minutes manual entry)
      │
      ▼
AI Matching Engine — scores available trucks by:
   ├── Driver location & miles to pickup
   ├── Remaining HOS hours
   ├── Equipment type match
   ├── Driver home direction preference
   └── Backhaul opportunity value
      │
      ▼
Dispatcher reviews ranked match list → assigns load (drag-and-drop or 1-click)
      │
      ▼
Driver notified → Load dispatched → Real-time tracking begins
      │
      ├── HOS Engine monitors continuously
      │     └── Alert raised 45 minutes before violation risk
      │
      ├── ETA Engine recalculates on traffic & position changes
      │
      └── Control Tower receives ShipmentEvent stream (if integrated)
      │
      ▼
Delivery → POD captured → Load closed → Analytics updated
```

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- Docker 24+
- Docker Compose v2+
- OpenAI-compatible API key (for AI BOL reader and match scoring)
- *(Optional)* Running HaulSync core instance for shared master data

### 1. Clone the repository

```bash
git clone https://github.com/your-org/haulsync-tms-dispatch.git
cd haulsync-tms-dispatch
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Key environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/haulsync_tms

# Auth (use same JWT_SECRET as HaulSync core for SSO)
JWT_SECRET=your-secret-key

# AI — BOL reader & matching engine
AI_PROVIDER=openai                        # or: azure, custom (OpenAI-compatible endpoint)
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4o                           # vision-capable model required for BOL reading
AI_BASE_URL=https://api.openai.com/v1     # override for Azure or self-hosted

# HOS monitoring
HOS_ALERT_LEAD_MINUTES=45                 # alert this many minutes before violation
HOS_RULE_SET=US_PROPERTY                  # or: US_PASSENGER, CANADA, CANADA_NORTH

# ELD Integration (optional — HOS can also be entered manually)
ELD_PROVIDER=samsara                      # or: keeptruckin, omnitracs, geotab, custom
ELD_API_KEY=your-eld-api-key

# Routing / Maps
MAPS_PROVIDER=google                      # or: here, mapbox, osrm (self-hosted)
MAPS_API_KEY=your-maps-api-key

# Matching engine weights (all values must sum to 1.0)
MATCH_WEIGHT_DISTANCE=0.30
MATCH_WEIGHT_HOS=0.25
MATCH_WEIGHT_EQUIPMENT=0.25
MATCH_WEIGHT_BACKHAUL=0.20

# HaulSync integrations (optional)
HAULSYNC_CORE_URL=http://localhost:5000
HAULSYNC_CORE_API_KEY=your-core-api-key
HAULSYNC_CT_URL=http://localhost:5002     # Control Tower integration
HAULSYNC_FLEET_URL=http://localhost:5003  # Fleet module integration
```

### 3. Launch all services

```bash
docker compose up -d
```

The backend automatically runs migrations and seeds on first boot.

### 4. Access the app

- **Frontend**: http://localhost:3004
- **Backend API**: http://localhost:5004
- **Health check**: http://localhost:5004/health

### Default credentials

| Email | Password | Role |
|-------|----------|------|
| `admin@haulsync.local` | `Admin@1234` | SUPER_ADMIN |
| `dispatch@haulsync.local` | `Dispatch@1234` | DISPATCHER |
| `driver@haulsync.local` | `Driver@1234` | DRIVER |
| `ops@haulsync.local` | `Ops@1234` | OPERATOR |
| `finance@haulsync.local` | `Finance@1234` | FINANCE |

---

## 🛠️ Manual Setup (Development)

### Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
node prisma/seed.js
npm run dev
# API runs on http://localhost:5004
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
# UI runs on http://localhost:5177
```

---

## 🤖 AI BOL Document Reader

The BOL reader accepts any image or PDF — including handwritten, faxed, or low-resolution scans — and extracts all critical load fields using a vision-capable AI model. Extracted data is presented to the dispatcher for a single-pass review before the load is created.

**Extracted fields:**

| Field | Examples |
|-------|---------|
| Pickup address | Street, city, state, ZIP |
| Delivery address | Street, city, state, ZIP |
| Pickup date/time | Date + time window |
| Commodity | Description, hazmat class if applicable |
| Weight | Total and per-unit if multi-piece |
| Piece count | Pallets, units, cartons |
| Special instructions | Appointment required, liftgate, temp range |
| BOL / PRO number | Reference number extraction |
| Shipper & consignee | Name and contact if present |

**Correction learning:** Every dispatcher correction is stored in `correctionStore.js` and used to fine-tune extraction prompts on a per-document-type basis. Accuracy improves continuously without retraining a model. See [BOL Reader Guide](docs/BOL_READER.md).

---

## ⚡ AI Load-to-Truck Matching Engine

The matching engine scores every available truck against an incoming load and returns a ranked list with per-factor confidence scores. Dispatchers see the top matches instantly — no manual searching required.

**Scoring factors and default weights:**

```json
{
  "scoringFactors": {
    "driverDistance": {
      "weight": 0.30,
      "description": "Miles from driver's current location to pickup — lower is better"
    },
    "hosRemaining": {
      "weight": 0.25,
      "description": "Hours of Service remaining vs. estimated trip duration — must have buffer"
    },
    "equipmentMatch": {
      "weight": 0.25,
      "description": "Exact match on trailer type (Dry Van, Reefer, Flatbed, etc.)"
    },
    "backhaulValue": {
      "weight": 0.20,
      "description": "Estimated revenue of backhaul opportunity from delivery location"
    }
  },
  "additionalSignals": [
    "Driver home direction preference",
    "Driver load history on lane",
    "Truck weight capacity vs. load weight",
    "Customer-driver preference or exclusions"
  ]
}
```

Weights are configurable in `.env` without code changes. See [Matching Engine Guide](docs/MATCHING_ENGINE.md).

---

## ⏱️ HOS Monitoring Engine

The HOS engine continuously evaluates every active driver's Hours of Service state and raises proactive alerts before a violation occurs — not after.

| Alert type | Trigger |
|------------|---------|
| **HOS warning** | Driver within `HOS_ALERT_LEAD_MINUTES` of daily driving limit |
| **Break required** | Driver approaching 8-hour continuous driving threshold |
| **Weekly limit warning** | Driver within 10 hours of 70-hour/8-day limit |
| **Sleeper split risk** | Driver's planned route cannot be completed under current HOS |
| **Violation detected** | Driver has exceeded a limit — escalated immediately |

HOS data sources (in priority order):

1. **ELD integration** — live telemetry from connected ELD provider (most accurate)
2. **Manual driver log** — drivers submit hours via the mobile-optimized driver portal
3. **GPS inference** — estimated from GPS movement data when no ELD is connected

Supported rule sets: `US_PROPERTY`, `US_PASSENGER`, `CANADA`, `CANADA_NORTH`. See [HOS Monitoring Guide](docs/HOS_MONITORING.md).

---

## 🔌 ELD Integrations

HaulSync TMS Dispatch ships with a pluggable ELD adapter layer (`backend/src/lib/eldAdapter.js`). Supported providers out of the box:

| Provider | Status |
|----------|--------|
| Samsara | ✅ Supported |
| KeepTruckin (Motive) | ✅ Supported |
| Omnitracs | ✅ Supported |
| Geotab | ✅ Supported |
| PeopleNet | ✅ Supported |
| BigRoad | ✅ Supported |
| Custom Webhook | ✅ Supported |

To add a new ELD provider, implement the `IELDAdapter` interface in `backend/src/integrations/eld/` and register it in the provider registry. See [ELD Integration Guide](docs/ELD_INTEGRATION.md).

---

## 🔁 Backhaul Optimization

The backhaul engine runs automatically during load-to-truck matching. For every candidate truck, it queries open loads with a pickup location within a configurable radius of the delivery destination and estimates the additional revenue opportunity. This surfaces backhaul matches the dispatcher would otherwise miss.

```json
{
  "backhaulConfig": {
    "searchRadiusMiles": 75,
    "minRevenueThreshold": 500,
    "maxDetourPercent": 15,
    "preferSameEquipmentType": true
  }
}
```

Backhaul revenue is shown directly on the match suggestion card so dispatchers can make load-pairing decisions in one click. See [Backhaul Optimization Guide](docs/BACKHAUL_OPTIMIZATION.md).

---

## 🗂️ Unified Dispatch Board

The dispatch board is the primary dispatcher interface. It shows all trucks and all loads on a single screen with real-time updates pushed via Socket.io — no page refresh required.

**Real-time events (Socket.io):**

| Event | Payload |
|-------|---------|
| `load:created` | `{ id, bolRef, pickup, delivery, status }` |
| `load:assigned` | `{ loadId, truckId, driverId, dispatchedAt }` |
| `load:statusUpdate` | `{ loadId, status, location, eta }` |
| `truck:locationUpdate` | `{ truckId, lat, lng, heading, speedKmh }` |
| `truck:statusChange` | `{ truckId, status, hosRemaining }` |
| `hos:alert` | `{ driverId, truckId, alertType, minutesRemaining }` |
| `hos:violation` | `{ driverId, truckId, ruleViolated }` |
| `match:suggested` | `{ loadId, suggestions: [{ truckId, score, factors }] }` |

---

## 🔐 Default Roles

| Role | Permissions |
|------|-------------|
| `SUPER_ADMIN` | Full access to all modules and system configuration |
| `ADMIN` | All operations except user management and AI configuration |
| `DISPATCHER` | Create/assign loads, review AI matches, monitor HOS, manage dispatch board |
| `OPERATOR` | Update load status, view dispatch board, upload BOL documents |
| `DRIVER` | View assigned loads, submit HOS logs, access driver portal |
| `FINANCE` | Invoice review, revenue reports, cost-per-mile analytics |
| `VIEWER` | Read-only access to dispatch board and analytics |

---

## 🔗 Integration with HaulSync Core & Modules

HaulSync TMS Dispatch is designed to run standalone or as part of the broader HaulSync platform.

**Standalone mode:** Uses its own truck, driver, and carrier master. Fully self-contained. No dependency on other HaulSync modules.

**Integrated mode:** Connects to other running HaulSync instances to share data and events.

| Integration | What is shared |
|-------------|----------------|
| HaulSync Core | Truck & driver master, company directory, user accounts via shared JWT |
| HaulSync Fleet | Live GPS position, driver behavior events, vehicle availability calendar |
| Control Tower | Load status pushed as `ShipmentEvent` objects via the CT adapter contract |

Set `HAULSYNC_CORE_URL`, `HAULSYNC_FLEET_URL`, and `HAULSYNC_CT_URL` in `.env` to enable the respective integrations. All three are independently optional.

---

## 📊 Analytics & Reports

HaulSync TMS Dispatch ships with a live analytics dashboard and scheduled reporting:

- **Dispatcher productivity** — loads dispatched per hour, average BOL entry time, AI acceptance rate per dispatcher
- **Fleet utilization** — loaded miles vs. deadhead miles, utilization % by truck and by week
- **HOS compliance rate** — violation frequency, alert-to-violation conversion rate, worst offenders
- **Revenue per mile** — gross and net revenue per loaded mile, per lane, and per driver
- **AI match acceptance** — how often dispatchers accept the top AI suggestion vs. override it, and outcome tracking
- **Backhaul capture rate** — backhaul revenue booked vs. opportunities surfaced
- **Automated MIS** — scheduled PDF/Excel report delivery via email on configurable cadence (daily, weekly, monthly)

---

## 📖 Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [BOL Reader Guide](docs/BOL_READER.md)
- [Matching Engine Guide](docs/MATCHING_ENGINE.md)
- [HOS Monitoring Guide](docs/HOS_MONITORING.md)
- [ELD Integration Guide](docs/ELD_INTEGRATION.md)
- [Backhaul Optimization Guide](docs/BACKHAUL_OPTIMIZATION.md)
- [Contributing Guide](CONTRIBUTING.md)

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
# Open a Pull Request
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

Part of the HaulSync open-source logistics ecosystem. Built with ❤️ for the freight community.
