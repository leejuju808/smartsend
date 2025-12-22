# Block 257900 — SmartSend AI Executive Brain v1 Implementation

## 🎯 Mission

**THE EXECUTIVE BRAIN FOR ROOFING COMPANIES — ZERO FLUFF.**

This block turns SmartSend into the owner’s intelligence layer:
- Daily Owner Briefings
- 0–100 Business Health Score
- Strategic Alerts (risks + opportunities)
- AI Recommendations (do this TODAY)
- Top 5 Wins / Top 5 Problems
- Executive metrics powered by the multi-company engine (Block 25820)

## ✅ What’s Implemented in V1

### 1. Database Schema — Executive Intelligence Storage ✅

**File:** `supabase/migrations/20251211000000_block257900_executive_brain_v1.sql`

#### A) `executive_health_scores`

Stores daily 0–100 business health scores per roofing company.

- `id uuid` — primary key
- `roofing_company_id uuid` — FK → `roofing_companies.id`
- `overall_score numeric(5,2)` — 0–100
- `categories jsonb` — per-dimension scores (sales, production, finances, reputation, staffing)
- `snapshot_date date` — one row per company per day
- `notes text` — optional explanation
- `created_at timestamptz`

**Indexes & Constraints:**
- Unique `(roofing_company_id, snapshot_date)`
- Index on `(roofing_company_id, created_at DESC)` for fast trend charts

#### B) `executive_alerts`

Instant red flags and opportunity alerts for owners.

- `id uuid` — primary key
- `roofing_company_id uuid` — FK → `roofing_companies.id`
- `alert_type text` — `risk`, `opportunity`, `financial`, `production`, `sales`, `staffing`, etc.
- `message text` — owner-facing message
- `severity text` — `low` | `medium` | `high` | `critical`
- `context jsonb` — structured metrics behind the alert
- `acknowledged boolean` — owner/leader has seen it
- `acknowledged_at timestamptz`
- `created_at timestamptz`

**Indexes:**
- `(roofing_company_id, created_at DESC)`
- `(roofing_company_id, severity, created_at DESC)`
- `(roofing_company_id, acknowledged, created_at DESC)` (filtered on unacknowledged)

#### C) `executive_recommendations`

Concrete owner-level action items (“Do this TODAY”).

- `id uuid` — primary key
- `roofing_company_id uuid` — FK → `roofing_companies.id`
- `recommendation text` — owner-facing action
- `category text` — `sales`, `production`, `finance`, `staffing`, `customer_experience`, etc.
- `context jsonb` — underlying metrics / links
- `target_date date` — usually `CURRENT_DATE`
- `completed boolean` — has this been handled?
- `completed_at timestamptz`
- `created_at timestamptz`

**Indexes:**
- `(roofing_company_id, target_date DESC, created_at DESC)`
- `(roofing_company_id, completed, target_date DESC)` (filtered on `completed = false`)

#### D) Row-Level Security (RLS)

All three tables are protected via Block 25820’s `is_company_member()` helper.

- Only members of a roofing company can read/write that company’s executive data
- `service_role` has full access for internal AI workers and cron jobs
- Grants: `SELECT`, `INSERT`, `UPDATE` to `authenticated` (RLS still applies)

### 2. TypeScript Types ✅

**File:** `src/types/database.ts`

Added strongly typed interfaces for runtime usage:

- `ExecutiveHealthScore`
- `ExecutiveAlert` (+ `ExecutiveAlertSeverity`)
- `ExecutiveRecommendation`

These mirror the new tables and make it easy to wire into dashboards, inboxes, and AI agents.

### 3. Executive Brain Engine Library ✅

**File:** `src/lib/executive-brain.ts`

Central engine that turns raw multi-company metrics into owner intelligence.

#### A) Business Health Score Engine

**Function:** `computeBusinessHealthScore(roofingCompanyId: string)`

- Reads from multi-company owner views created in Block 25820:
  - `v_owner_company_comparison`
  - `v_owner_sales_rep_rankings`
  - `v_owner_crew_performance`
- Derives per-category scores:
  - **Sales** — average close rate + pipeline depth
  - **Production** — ratio of active jobs to completed jobs
  - **Finances** — this month’s revenue vs total historical revenue
  - **Reputation** — proxy based on close rate (pluggable into reviews later)
  - **Staffing** — jobs-per-crew load heuristic
- Computes overall 0–100 score via weighted blend:
  - 25% Sales, 25% Production, 25% Finances, 15% Reputation, 10% Staffing
- Identifies **strong areas** (≥ 80) and **weak areas** (≤ 70)
- Upserts into `executive_health_scores` (one row per company per day)

**Return type:** `BusinessHealthScoreResult`

```ts
{
  companyId,
  snapshotDate,
  overallScore,
  categories, // { sales, production, finances, reputation, staffing }
  weakAreas,
  strongAreas,
}
```

#### B) Strategic Alert Engine

**Function:** `generateStrategicAlerts(roofingCompanyId: string)`

- Uses the latest computed health score
- Emits alerts when categories dip below thresholds:
  - **Financial alert** when `finances < 70`
  - **Production alert** when `production < 70`
  - **Sales alert** when `sales < 70`
- Writes rows into `executive_alerts` with structured `context`
- Returns lightweight `ExecutiveAlertSummary[]` for the API layer

#### C) Executive Recommendations Engine

**Function:** `generateExecutiveRecommendations(roofingCompanyId: string, health: BusinessHealthScoreResult)`

- Converts weak categories into concrete owner actions, e.g.:
  - Sales: “Review this week’s open estimates and call the top 10 by value.”
  - Production: “Reassign at least one job from your most overloaded crew.”
  - Finance: “Review AR over 30 days and schedule at least 3 collection calls.”
- Inserts into `executive_recommendations`
- Returns `ExecutiveRecommendationSummary[]`

#### D) Wins / Problems Summary

**Function:** `deriveWinsAndProblems(health)`

- **Wins**: categories with score ≥ 85 → “Sales Performance is a strong advantage right now.”
- **Problems**: categories with score ≤ 70 → “Production Timeliness needs attention.”
- Fallback messaging when everything is balanced

#### E) Cash Flow Forecast (V1 Stub)

**Function:** `computeCashFlowForecast(roofingCompanyId)`

- Currently returns `null` by design until full AR/AP + payroll + materials data is wired in
- API shape is locked so we can later plug in real projections without breaking clients

#### F) Owner Daily Briefing Composer

**Function:** `generateOwnerDailyBriefing(roofingCompanyId: string)`

Pipeline:
1. `computeBusinessHealthScore`
2. `generateStrategicAlerts`
3. `generateExecutiveRecommendations`
4. `deriveWinsAndProblems`
5. `computeCashFlowForecast`
6. Attach company name from `roofing_companies`

Returns a ready-to-render **Owner Daily Briefing**:

```ts
{
  companyId,
  companyName,
  date,
  health,
  alerts,
  recommendations,
  winsProblems,
  cashFlow, // null in V1 until wired
  headline,   // “Good morning — here is your SmartSend Executive Briefing…”
  highlights, // key bullets including health score narrative
  risks,      // high/critical alerts
  opportunities, // medium/low alerts
}
```

This is the core data structure for:
- Morning email briefings
- In-app executive summary cards
- Mobile push notifications

### 4. API — Owner Daily Briefing Endpoint ✅

**File:** `src/app/api/executive/briefing/route.ts`

**Routes:**
- `GET /api/executive/briefing?companyId=...`
- `POST /api/executive/briefing` with JSON `{ companyId }`

**Behavior:**
- Validates `companyId`
- Calls `generateOwnerDailyBriefing(companyId)`
- Returns the full `OwnerDailyBriefing` JSON payload
- Logs and returns 500 on any server-side failure

This endpoint is the single source of truth for:
- Owner Morning Report cards
- Executive dashboard summary
- Future mobile app “Morning Briefing” screen

### 5. Environment & Security ✅

The Executive Brain uses a **service-role Supabase client** on the server side only (mirrors analytics API pattern):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred)
- Falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` only if service role is missing (for dev), but RLS still applies

RLS is enforced via `is_company_member(roofing_company_id)` so:
- Owners/admins/authorized staff see ONLY their company’s executive data
- Multi-company environments stay fully isolated

## 🎛 How to Use This in Product

### 1. Morning Owner Briefing (UI)

- Call `GET /api/executive/briefing?companyId=...` from:
  - A server component that renders the dashboard
  - A background job that sends morning emails at 6 AM
- Render:
  - `headline`
  - `highlights`
  - `health.overallScore` and category breakdown
  - `risks` and `opportunities`
  - `winsProblems.wins` and `winsProblems.problems`

### 2. Executive Dashboard (High-Level Metrics)

- Use `OwnerDailyBriefing` as the **top card** on the owner dashboard
- Use `executive_health_scores` for trend charts:
  - 7-day / 30-day health trend
  - Category-specific trendlines
- Use `executive_alerts` and `executive_recommendations` as:
  - “Critical Risks” list
  - “Today’s Action List”

### 3. Future Cash Flow Forecast (Next Slice)

To fully realize the cash flow examples in the spec:
- Wire in:
  - AR aging tables (invoices, receivables)
  - Payroll / sub / material cost tables (from payroll & inventory blocks)
- Extend `computeCashFlowForecast` to:
  - Sum expected incoming over next 7 days (jobs + supplements)
  - Sum outgoing payroll, subs, materials
  - Compute projected net and risk level

The API surface is already in place; only the internal computation needs to be upgraded.

## 📋 Acceptance Checklist

- [x] **Schema**: `executive_health_scores`, `executive_alerts`, `executive_recommendations` created with indexes + RLS
- [x] **Types**: TS interfaces added to `src/types/database.ts`
- [x] **Engine**: `src/lib/executive-brain.ts` with health scoring, alerts, recommendations, wins/problems, briefing composer
- [x] **API**: `GET/POST /api/executive/briefing` returning a full Owner Daily Briefing payload
- [x] **Security**: RLS enforced via `is_company_member`, `service_role` bypass for workers
- [ ] **UI**: Executive dashboard and Morning Briefing card wired to this API
- [ ] **Cash Flow**: Real AR/AP + payroll/materials-driven forecast implemented
- [ ] **Review Signals**: Reputation score upgraded to use real review + NPS data

## 🧭 Next Steps (Suggested)

1. **Owner Dashboard UI**
   - Add an `Executive Overview` card to the owner dashboard powered by `/api/executive/briefing`.
   - Show overall score, category chips, and top 3 risks + actions.

2. **Morning Email Briefing**
   - Add a cron/Edge Function that calls `generateOwnerDailyBriefing` at 6 AM local time per company.
   - Email the briefing to owners and key leaders.

3. **Deep Financial & Cash Flow Wiring**
   - Connect AR, AP, payroll, and materials tables
   - Implement real `computeCashFlowForecast` logic

4. **Job-Level & PM-Level Alerts**
   - Extend `context` on alerts to reference jobs, PMs, and crews
   - Drive PM/crew performance views directly from the same alerts engine

This block makes SmartSend the **executive brain** for roofing companies — a single place where the owner sees health, problems, and exact actions to take today.













