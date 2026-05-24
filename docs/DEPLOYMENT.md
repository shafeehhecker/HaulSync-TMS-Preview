# HaulSync TMS Dispatch — Deployment Guide

## Fix: Prisma + Alpine Linux (OpenSSL error)

If you see this on first boot:
```
prisma:warn Prisma failed to detect the libssl/openssl version
Error: Could not parse schema engine response: SyntaxError: Unexpected token 'E'...
```

The `node:20-alpine` base image does not ship OpenSSL. Prisma's schema engine requires it. The fix is already applied in the current `backend/Dockerfile`:

```dockerfile
FROM node:20-alpine

# Required by Prisma schema engine on Alpine
RUN apk add --no-cache openssl

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN mkdir -p uploads/bols uploads
EXPOSE 5004
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && node server.js"]
```

After updating an older copy of the Dockerfile:
```bash
docker compose down
docker compose build --no-cache backend
docker compose up -d
```

You can also remove the `version:` line from `docker-compose.yml` — it is obsolete in modern Docker Compose and produces a warning in logs.

---

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
# Edit .env — set JWT_SECRET and AI_API_KEY at minimum
docker compose up -d
curl http://localhost:5004/health
```

Open http://localhost:3004 · Sign in: `admin@haulsync.local` / `Admin@1234`

---

## Manual setup (development)

```bash
# Backend
cd backend && cp .env.example .env
npm install
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev   # :5004

# Frontend (separate terminal)
cd frontend && cp .env.example .env
npm install
npm run dev   # :3004
```

Vite proxies `/api` and `/uploads` to `:5004` — no extra config needed.

---

## Required environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing key — use same value as HaulSync Core for SSO |
| `AI_API_KEY` | OpenAI (or compatible) API key |

## Key optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_BASE_URL` | `https://api.openai.com/v1` | Override for Azure OpenAI, Ollama, or any OAI-compatible endpoint |
| `AI_MODEL` | `gpt-4o` | Any vision-capable model at the configured endpoint |
| `HOS_WARNING_BUFFER_MINUTES` | `45` | Minutes before a limit to raise an alert |
| `HOS_WEEKLY_WARNING_HOURS` | `10` | Hours before weekly cap to warn |
| `MATCH_WEIGHT_DISTANCE` | `30` | Matching engine distance weight |
| `MATCH_WEIGHT_HOS` | `25` | HOS weight |
| `MATCH_WEIGHT_EQUIPMENT` | `25` | Equipment weight |
| `MATCH_WEIGHT_BACKHAUL` | `20` | Backhaul value weight |
| `MATCH_BACKHAUL_RADIUS_MILES` | `150` | Backhaul opportunity search radius |
| `DEFAULT_ELD_PROVIDER` | `manual` | `samsara` `motive` `geotab` `omnitracs` etc. |
| `HAULSYNC_CT_URL` | — | Control Tower base URL (enables ShipmentEvent push) |
| `FRONTEND_URL` | `http://localhost:3004` | CORS allowed origin(s), comma-separated |
| `PORT` | `5004` | Backend port |

---

## Demo credentials

| Email | Password | Role |
|-------|----------|------|
| `admin@haulsync.local` | `Admin@1234` | SUPER_ADMIN |
| `dispatcher@haulsync.local` | `Dispatch@1234` | DISPATCHER |
| `operator@haulsync.local` | `Ops@1234` | OPERATOR |
| `finance@haulsync.local` | `Finance@1234` | FINANCE |

---

## Useful commands

```bash
# Rebuild after code changes
docker compose build --no-cache backend && docker compose up -d backend

# Live backend logs
docker compose logs -f backend

# Re-seed demo data
docker compose exec backend node prisma/seed.js

# Prisma Studio (data browser at :5555)
docker compose exec backend npx prisma studio --port 5555

# PostgreSQL shell
docker compose exec postgres psql -U haulsync -d haulsync_tms
```

---

## Production checklist

- Set `JWT_SECRET` to a 256-bit random string
- Set `NODE_ENV=production` (disables stack traces in error responses)
- Mount `uploads/bols/` and `uploads/corrections.json` on persistent storage
- Place Nginx with SSL in front — proxy `/api/` and `/socket.io/` to backend, `/` to frontend
- For multiple backend replicas: add `@socket.io/redis-adapter` and set `REDIS_URL`
- Run `npx prisma migrate deploy` before deploying new code (idempotent, safe)
