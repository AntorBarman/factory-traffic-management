# Factory Traffic Management System

A small event-driven traffic-control system for internal factory roads. Built for the CSI Smart Tech Backend Developer Intern Assessment V2.

## Overview

The system manages traffic signals at **Junction A** with two conflicting phases:

- `NORTH + SOUTH`
- `EAST + WEST`

Safety invariants (enforced centrally in the domain layer):

1. Conflicting phases never receive GREEN simultaneously.
2. GREEN never transitions directly to a conflicting GREEN.
3. Manual and emergency commands never bypass the safe transition sequence.
4. Invalid requests never place the junction into an unsafe state.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + TypeScript + Express 5 |
| ORM | Prisma 6 |
| Database | Supabase PostgreSQL (Session Pooler) |
| Validation | Zod |
| Frontend | Next.js 16 + React 19 + Tailwind 4 |
| Testing | Vitest |
| Tooling | ts-node-dev, Prisma Studio |

## Architecture

```
┌─────────────────────┐
│ Next.js Dashboard   │
└──────────┬──────────┘
           │ HTTP (REST)
┌──────────▼──────────┐
│ Express API Layer   │ ← api/routes/*
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Application Layer   │ ← application/*.service.ts
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Domain Engine       │ ← domain/* (no HTTP/DB/MQTT deps)
└──────────┬──────────┘
           │
    ┌──────┴───────┐
    ▼              ▼
┌─────────┐  ┌──────────────┐
│ Prisma  │  │ Controller   │
│ (DB)    │  │ Adapter      │
└─────────┘  └──────────────┘
```

**Key separation:**
- `domain/` — pure TypeScript, no imports from Express, Prisma, or MQTT
- `application/` — orchestrates domain + infrastructure
- `api/` — HTTP routes, request validation
- `infrastructure/` — DB client, locks, controller adapter

## Setup & Run

### Prerequisites
- Node.js 20+
- Supabase account (free tier)
- Git

### 1. Clone & Install

```bash
git clone <repo-url>
cd factory-traffic-management

# Backend
cd backend
npm install

# Frontend (in another terminal)
cd ../frontend
npm install
```

### 2. Supabase Setup

1. Create a Supabase project (https://supabase.com).
2. From **Settings → Database → Connection String**:
   - Copy the **Session Pooler** URI (port **5432**) — used for both runtime and migrations in this project.
   - Keep the `postgres.PROJECT_REF` username format.

### 3. Backend `.env`

Create `backend/.env`:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?connection_limit=5&pool_timeout=30"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
PORT=4000
NODE_ENV=development
```

> **Why Session Pooler?** Supabase's Transaction Pooler (port 6543) does not support interactive transactions with row-level locks reliably. Our `withJunctionLock` uses `SELECT ... FOR UPDATE` inside a transaction, which requires Session Pooler (port 5432).

### 4. Migrate & Seed

```bash
cd backend
npx prisma generate
npx prisma migrate deploy     # or `migrate dev` for first-time setup
npx prisma db seed
```

You should see: `✅ Junction A + JunctionState seeded`

### 5. Run Backend

```bash
npm run dev
```

Expected:
```
🚦 Factory Traffic Backend running on http://localhost:4000
[worker] Background worker started
```

### 6. Frontend `.env.local`

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 7. Run Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

## Traffic-Control Algorithm

### Phase Selection (Scheduler)

Each direction's queue is scored:

```
score(direction) = queueSize × 10
                 + Σ(vehiclePriority × 20)
                 + Σ(min(waitSeconds, 120) × 0.5)
                 + starvationBonus (200 if oldest wait > 60s)
```

Vehicle priority:
| Type | Priority |
|------|----------|
| EMERGENCY | 4 |
| TRUCK | 3 |
| FORKLIFT | 2 |
| EMPLOYEE_VEHICLE | 1 |

Phase score = sum of the two directions in that phase.

Hysteresis: 25% margin prevents unnecessary phase switching when scores are close.

### Safe Transitions

```
NORTH_SOUTH GREEN  (30s)
     │
NORTH_SOUTH YELLOW (5s)
     │
ALL_RED            (2s)
     │
EAST_WEST GREEN    (30s)
```

This is enforced by `planSafeTransition()` in `domain/state-machine.ts`. No client command can bypass it.

### Emergency Preemption

Emergency vehicles trigger an immediate safe transition:

```
Current GREEN phase
     │
YELLOW
     │
ALL_RED
     │
Target GREEN (emergency direction)
```

Emergency status is set via `junctionState.emergencyActive = true`. When the emergency vehicle is cleared, the flag is released only if no other emergency vehicles remain queued.

## Concurrency Strategy

**Per-junction row-level lock** inside a Prisma transaction:

```typescript
await tx.$queryRaw`SELECT id FROM "Junction" WHERE id = ${junctionId} FOR UPDATE`;
```

Effects:
- Two requests for the same junction serialize.
- Different junctions process in parallel.
- No long blocking locks on unrelated rows.

**Why Session Pooler:** Prisma transactions + `FOR UPDATE` require session state, which Transaction Pooler (pgbouncer) does not preserve.

## Persistence & Restart Recovery

**Persisted:**
- Junction configuration and current phase
- Desired signal state and controller-confirmed actual state
- Queue entries (with `WAITING` / `CLEARED` status)
- Processed event IDs (idempotency)
- Command history (PENDING / ACK / TIMEOUT / FAILED)
- Audit log

**On restart:**
- Desired state is restored from DB.
- Actual state is **NOT** assumed — the backend waits for a fresh controller ACK before trusting any physical state.
- PENDING commands older than `COMMAND_TIMEOUT_MS` are automatically expired by the background worker.

## How to Demonstrate the Main Scenarios

### 1. Normal Traffic
Dashboard → Simulate Sensor Event → `VEHICLE_ARRIVED` / `NORTH` / `TRUCK` / `VH-501` → Submit.
**Expected:** NORTH queue = 1, Recent Activity shows `VEHICLE_DETECTED`.

### 2. Priority Traffic
Add one `EMPLOYEE_VEHICLE` on `NORTH` and one `TRUCK` on `EAST`. Scheduler scores EAST higher. Both directions get served, but the TRUCK-including phase wins ties.

### 3. Emergency Preemption
Add `EMERGENCY` from `EAST`. Red banner appears. Mode → EMERGENCY. Safe transition begins.

### 4. Manual Override
Click **Manual GREEN: WEST**. Mode → MANUAL. Pending command banner appears. Click **Return to AUTOMATIC** to restore auto mode.

### 5. Duplicate Event (Idempotency)
```bash
curl -X POST http://localhost:4000/api/sensor-events \
  -H "Content-Type: application/json" \
  -d '{"event_id":"evt-dup","junction_id":"A","direction":"SOUTH","event_type":"VEHICLE_ARRIVED","vehicle_id":"VH-9","vehicle_type":"FORKLIFT"}'
```
Run the same command twice. Second response: `{"success":true,"duplicate":true}`. Queue remains 1.

### 6. Vehicle Clearance
Submit `VEHICLE_CLEARED` for an existing `vehicle_id` — the corresponding queue entry is marked `CLEARED`. If no matching arrival exists, the event is logged as `CLEARED_WITHOUT_ARRIVAL` and does not decrement below zero.

### 7. Controller Failure / Timeout
1. Manual GREEN request creates a PENDING command.
2. Do not send an ACK.
3. After `COMMAND_TIMEOUT_MS` (10s), the background worker marks the command `TIMEOUT` and the controller as `DEGRADED`.
4. Dashboard displays a warning banner.

### 8. Restart
Stop the backend (`Ctrl+C`), restart (`npm run dev`). All queue, audit, and configuration state is restored from Supabase. Desired state is trusted; actual state requires a new ACK.

### 9. Concurrent Events
The per-junction lock ensures that events affecting the same junction serialize. Conflicting GREEN is impossible by construction (`assertSafetyInvariant`).

## API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/api/junctions` | List junctions |
| GET | `/api/junctions/:id` | Junction detail |
| POST | `/api/junctions` | Create junction |
| GET | `/api/junctions/:id/status` | Full live state |
| GET | `/api/junctions/:id/history` | Audit log |
| POST | `/api/sensor-events` | Vehicle arrival / cleared |
| POST | `/api/junctions/:id/commands` | Manual / emergency / return-to-auto |
| POST | `/api/controller-events` | ACK / NACK / TIMEOUT from physical controller |

Postman collection: `postman/factory-traffic.postman_collection.json`

## Tests

```bash
cd backend
npx vitest run
```

Coverage:
- `state-machine.test.ts` — Safety invariants (7 tests)
- `scheduler.test.ts` — Scoring and phase selection (9 tests)
- `idempotency.test.ts` — Duplicate event and clearance handling (4 tests)

**20 tests, all pass.**

## Assumptions / Questions / Requirement Issues

The specification intentionally contains incomplete and ambiguous requirements. Below are the issues identified and the decisions made.

### 1. Manual override duration
**Issue:** No rule for how long MANUAL mode persists.
**Decision:** Manual remains active until explicitly returned via `RETURN_TO_AUTOMATIC`. No automatic expiry (would be surprising for operators).

### 2. Emergency vs Manual precedence
**Issue:** Spec asks but does not resolve.
**Decision:** Emergency has higher priority. If an emergency is detected while in MANUAL mode, the system transitions to EMERGENCY and safely preempts. After the emergency is cleared, mode returns to AUTOMATIC (not MANUAL — safety-first default).

### 3. Competing emergencies from conflicting directions
**Issue:** Two emergency vehicles from N/S and E/W.
**Decision:** The first valid arrival wins the current preemption cycle. The second is queued; after the first emergency is cleared, the scheduler re-evaluates and services the next emergency. This avoids oscillations between conflicting phases.

### 4. VEHICLE_CLEARED without matching arrival
**Issue:** Spec says queue can't go negative but doesn't define the behavior.
**Decision:** Ignore the clearance (do not decrement), log an audit entry `CLEARED_WITHOUT_ARRIVAL`. Vehicle ID must match an active queue entry.

### 5. Out-of-order / delayed sensor events
**Issue:** Which field is authoritative — `event_id`, `sequence_no`, `timestamp`?
**Decision:** `event_id` is the **idempotency key**. `sequence_no` is stored for audit but not used for ordering decisions (we accept events in arrival order). The sensor timestamp is preserved for forensics; the server-received timestamp drives waiting-time calculations. This means delayed events are processed on arrival, not back-dated.

### 6. Controller ACK timeout
**Issue:** Spec doesn't specify duration.
**Decision:** `COMMAND_TIMEOUT_MS = 10_000`. Background worker scans every 2s. Timed-out commands set controller status to `DEGRADED`.

### 7. Retry on controller timeout
**Issue:** Should commands be retried?
**Decision:** No automatic retry — that would risk double-execution against a possibly non-idempotent physical device. On timeout we set `DEGRADED` and surface the mismatch. A human operator decides next steps.

### 8. Restart during a pending command
**Issue:** What if server dies between "command sent" and "ACK received"?
**Decision:** On startup, PENDING commands past their timeout are expired. `actual_state` remains as last confirmed by the controller — we never assume the desired state was executed.

### 9. `desired_state` vs `actual_state` divergence
**Issue:** Spec asks how to react.
**Decision:** Expose both to the frontend. When they differ beyond ACK timeout, controller is marked `DEGRADED` and the UI displays a warning banner.

### 10. Supabase pooler mode
**Issue:** Transaction Pooler vs Session Pooler.
**Decision:** Session Pooler (port 5432). Reason: our per-junction row lock uses `SELECT ... FOR UPDATE` inside a transaction, which pgbouncer's transaction mode does not preserve. Session Pooler supports prepared statements and interactive transactions.

### 11. Multiple junctions
**Issue:** Spec says architecture must allow Junctions B/C/D later.
**Decision:** The domain engine (`state-machine.ts`, `scheduler.ts`) and the concurrency primitive (`withJunctionLock(junctionId, fn)`) are junction-agnostic. Adding a junction only requires a new `Junction` + `JunctionState` row and the API naturally handles it via `:id` param.

### 12. Sensor timestamp authority
**Issue:** Should we trust sensor timestamps for waiting-time calculations?
**Decision:** No. We use server-received time for scheduler waiting-time calculation because sensor clocks may drift or lag. The sensor timestamp is preserved in the audit log for forensic analysis.

## Major Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Layered architecture (API / Application / Domain / Infrastructure) | Keeps traffic-control logic independent of HTTP, DB, and MQTT. Enables unit testing without infrastructure. |
| CommonJS module system | Express, Prisma, dotenv are CommonJS-native. Avoids ESM `.js` extension friction. |
| Session Pooler + `SELECT ... FOR UPDATE` | Row-level serialization per junction without global locks. Safe under concurrent events. |
| Idempotency via unique `event_id` | Duplicate sensor submissions never mutate queue state twice. |
| Persistent desired/actual split | On restart, actual state is only trusted after fresh controller ACK. |
| Background worker (no `sleep()` in handlers) | Timeouts and (future) phase advancement run outside request lifecycle. |
| Polling (2s) in frontend | Simpler than WebSocket/SSE; adequate for assessment scope. |

## AI / Tool Usage

AI-assisted development tools were used during implementation:

- **Claude (Anthropic)** — architecture brainstorming, safety invariant review, code scaffolding, debugging Supabase/Prisma connection issues, README drafting
- **ChatGPT** — secondary debugging aid for TypeScript/Prisma errors

Every piece of AI-generated code was reviewed, tested, and modified by me. Specifically:

- All architectural decisions (layered separation, per-junction lock, state-machine design)
- All safety rules and invariants (`assertSafetyInvariant`, `planSafeTransition`)
- All scheduler scoring weights and starvation policy
- All failure-handling decisions (timeout, retry policy, restart behavior)
- All manual-mode and emergency policies

I understand the entire codebase and can explain, debug, or modify any part of it during technical review. AI chat history has been submitted separately.

## Incomplete / Next Steps

Given the 4–5 hour scope, the following were consciously deprioritized:

- **MQTT integration** — the `controller-adapter.ts` interface is designed to be MQTT-ready; only the transport needs swapping.
- **WebSocket / SSE live updates** — polling (2s) is sufficient for the assessment.
- **Authentication on manual control** — no auth, documented as a known gap.
- **Docker Compose** — optional; not added to keep the setup minimal.
- **Multiple-junction UI** — backend is multi-junction-ready; frontend focuses on Junction A.
- **Event replay** — audit log supports it structurally; not exposed via API.

## License

ISC — assessment submission.