# Block 258000 — SmartSend Full Ecosystem Sync v1

## Overview

This block turns SmartSend from a collection of powerful modules into **one unified operating system for roofing companies**.

We implement a **global event backbone** and **unified data brain** that connect:
- **Sales → Production → Billing → Service**
- **Crews → Materials → Scheduling**
- **Profit Engine → Forecasting → Executive Brain**
- **Customer Portal → Office Admin → Warranty**
- **Subs → Work Orders → Payments → Compliance**

Every key business event (estimate accepted, contract signed, materials delivered, crew clock-in, inspection passed, job completed, payment received, warranty expired, service request created, sub overcharge detected) now:

1. **Emits a global event** into a single event stream
2. **Triggers cross-system automation flows**
3. **Updates the unified data layer**
4. **Feeds the AI context brain**
5. **Updates dashboards, KPIs, and forecasting**

This is the **brain stem** of SmartSend.

---

## 1. Global Event System

### Goal

Create a **single global event bus** so that **all modules react to each other automatically**.

### Core Concepts

- **Event types**: `estimate_accepted`, `contract_signed`, `permit_approved`, `materials_delivered`, `crew_clock_in`, `inspection_passed`, `job_completed`, `payment_received`, `warranty_expired`, `service_request_created`, `sub_overcharge_detected`, etc.
- **Event stream**: append-only log of everything that happens in the roofing company.
- **Event handlers**: small, focused processors that subscribe to specific event types and run actions across modules.

### Database Changes

#### 1. `global_events` table

New migration (e.g. `20250228000000_block258000_global_events.sql`):

- **Table: `global_events`**
  - `id` (uuid, pk, default gen_random_uuid())
  - `company_id` (uuid, indexed)
  - `workspace_id` (uuid, indexed, nullable)
  - `actor_user_id` (uuid, nullable) — who caused the event (user, system, integration)
  - `event_type` (text, indexed) — constrained by enum check or separate `global_event_types` lookup
  - `entity_type` (text, indexed) — e.g. `lead`, `job`, `invoice`, `service_ticket`, `warranty`, `crew`, `material_order`
  - `entity_id` (uuid, indexed)
  - `correlation_id` (uuid, nullable, indexed) — to group events belonging to the same business flow
  - `payload` (jsonb) — normalized event payload (fields like `estimate_id`, `job_id`, `amount`, `stage`, etc.)
  - `source` (text) — `app`, `api`, `integration`, `import`, `system`
  - `created_at` (timestamptz, default now(), indexed)
  - `processed_at` (timestamptz, nullable) — when the core automation engine processed this event

- **Indexes**
  - `idx_global_events_company_created_at`
  - `idx_global_events_event_type_created_at`
  - `idx_global_events_entity_type_entity_id`
  - `idx_global_events_correlation_id`

- **RLS**
  - Enforce that users only see events for companies/workspaces they belong to.

#### 2. `global_event_handlers` table

- `id` (uuid, pk)
- `company_id` (uuid, nullable) — null = system default handler (applies to all companies)
- `event_type` (text, indexed)
- `name` (text) — human-friendly label (e.g. "Estimate Accepted → Create Job + Contract")
- `is_active` (boolean, default true)
- `handler_kind` (text) — `system`, `automation_flow`, `webhook`
- `config` (jsonb) — handler-specific configuration
  - for `automation_flow`: references a flow id and mapping
  - for `webhook`: URL, headers, retry policy
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

This lets us programmatically register and manage which handlers run for each event type.

### Database Functions

- `emit_global_event(p_company_id, p_workspace_id, p_event_type, p_entity_type, p_entity_id, p_payload jsonb, p_actor_user_id uuid)`
  - Inserts into `global_events`
  - Returns the inserted event

- `mark_global_event_processed(p_event_id uuid)`
  - Sets `processed_at` timestamp

These are called from application code and/or triggers in existing tables.

### Edge Function / Worker

- **Function: `process-global-events`**
  - Polls `global_events` where `processed_at IS NULL`
  - For each event:
    - Loads all active `global_event_handlers` for that `event_type` and `company_id` (plus system defaults)
    - Fan-out into handler execution jobs (can be another queue/table or in-memory for now)
    - Marks event as `processed_at = now()` once jobs are enqueued

Handlers should be **idempotent** so replays are safe.

### Integration Points

We wire `emit_global_event` into key moments across modules:

- Sales / leads / estimates
- Jobs and job pipeline (creation, stage changes, completion)
- Production calendar, crew scheduling, materials ordering
- Billing & payments, AR engine
- Service tickets & warranty
- Subs, work orders, compliance

Example events emitted:

- `estimate_accepted` — from estimate/quote module
- `contract_signed` — from e-signature / proposal acceptance
- `permit_approved` — from permitting workflow
- `materials_delivered` — from inventory / supplier integration
- `crew_clock_in` — from crew app / time tracking
- `inspection_passed` — from job inspection module
- `job_completed` — from production pipeline
- `payment_received` — from billing / Stripe / accounting integration
- `warranty_expired` — from warranty engine
- `service_request_created` — from homeowner portal / inbound messaging
- `sub_overcharge_detected` — from job cost / subs reconciliation

---

## 2. Cross-System Automation Flows

### Goal

When a high-value event happens, **every relevant module reacts automatically**.

We implement **system-level automation flows** wired to the global event bus.

### Architecture

We reuse or extend the existing automation engine (campaign flows, task creation, calendar scheduling) and add **ecosystem-specific flows**.

- **Flows definition table** (if not already present): `ecosystem_automation_flows`
  - `id`, `company_id`, `name`, `trigger_event_type`, `is_active`, `definition` (jsonb)
- **Flow definition JSON**:
  - `conditions` (e.g. job type = reroof, job value > $X, insurance = true)
  - `actions` (ordered list)
  - `fallbacks` (what to do if some action fails)

### Key Flows

#### A. Sales → Production (Estimate Sold → Job in Production)

**Trigger:** `estimate_accepted` or `contract_signed`

**Actions (system default flow):**

1. **Create Job**
   - If no `job` exists, create new `jobs` row from estimate
   - Map: customer, address, roof type, scope, price, insurer, deductible
   - Set `jobs.stage = 'sold'` / install pipeline start

2. **Generate Contract Document**
   - Create contract record and PDF (if not already done via signature module)
   - Attach to job & customer profile

3. **Schedule Permit Creation Task**
   - Create task: "Submit permit application" assigned to office/PM
   - Due date = now + X days (configurable per company)

4. **Send Customer Portal Link**
   - Create portal access for the homeowner (if not exists)
   - Send email/SMS via unified messaging: "Your job is moving to production"

5. **Assign PM Based on Workload**
   - Use capacity/crew/PM assignment logic to pick best PM
   - Create PM assignment record
   - Notify PM in dashboard/inbox

6. **Start Material Calculation**
   - Push job to materials engine
   - Create `job_materials` rows or material estimate job

7. **Forecast Revenue Increase**
   - Insert or update revenue forecast using job value and expected timeline

8. **Update Executive Dashboard**
   - Emit secondary event `job_pipeline_moved` / `revenue_forecast_updated`
   - Feeds command center and performance dashboards

#### B. Production → Billing (Final Inspection Complete → Invoice & AR)

**Trigger:** `inspection_passed` / `job_completed`

**Actions:**

1. **Generate Final Invoice**
   - Create invoice with final job amount and adjustments
   - Link to job and customer

2. **Update Customer Portal**
   - Show job completed status
   - Show invoice + payment options
   - Show warranty terms

3. **Schedule AR Reminders**
   - Insert AR schedule: reminder X days after invoice, etc.

4. **Kick Off Profit Engine Calculation**
   - Mark job as ready for final cost/profit reconciliation
   - Trigger job cost engine to finalize margin, cost per square, etc.

#### C. Billing → Executive Brain (Payment Received → Forecast & Briefing)

**Trigger:** `payment_received`

**Actions:**

1. **Update Revenue Forecasts**
   - Move amount from forecast → actual
   - Adjust future cash flow curves

2. **Update Job Profit & Margin**
   - Recalculate job profit after final payment
   - Update KPIs (margin, cost per square, revenue per crew per day)

3. **Update Executive Dashboards**
   - Feeds: Command Center, CEO dashboard, cash flow view

4. **Add to Executive Briefing Queue**
   - Append event to "tomorrow morning" executive briefing summary for that company

---

## 3. Unified Data Layer (Single Source of Truth)

### Goal

End **data silos**. Make **one record of truth** per customer, job, and company that all modules use.

We do this by:

1. Normalizing key entities (customer, job, project, warranty, service ticket)
2. Creating **views** and **helper functions** that join all related data
3. Feeding this into dashboards, AI, and automations

### Core Entities

These tables already exist across earlier blocks; this block focuses on **linking them consistently** and surfacing them.

- `customers` / `leads`
- `jobs`, `job_stage_events`, `job_schedule`, `job_photos`, `job_tasks`
- `job_costs`, `job_cost_items`, `job_materials`, `job_day_schedules`, etc.
- `invoices`, `payments`, `revenue_forecasts`, `job_cost_forecasts`
- `warranties`, `service_tickets` / `service_requests`
- `messages` / unified inbox
- `crew_assignments`, `subs`, `work_orders`

### New Views

#### 1. `customer_unified_view`

- One row per customer (homeowner/decision-maker):
  - Basic info: name, email, phone, address
  - **Job history**: list of jobs, statuses, dates
  - **Photos & documents**: aggregated from job photos, contracts, inspections
  - **Warranty status**: active warranties
  - **Service history**: tickets, resolutions, response times
  - **Communications**: last contact date, channel, sentiment score
  - **Financials**: total revenue, balance due, lifetime value

Used by: customer portal, service module, executive brain, forecasting.

#### 2. `job_unified_view`

- One row per job:
  - Customer + property
  - Sales info: estimator, source, sold date, value, insurance info
  - Production info: current stage, scheduled dates, crew assignments
  - Materials: ordered, delivered, variances
  - Financials: invoices, payments, profit, cost per square
  - Quality: inspections, punch list, callbacks
  - Warranty: coverage, expiry
  - Service: related service tickets
  - Communication summary: last message, open issues

Used by: production board, crew app, profit engine, forecasting, AI.

#### 3. `company_performance_view`

- Aggregated metrics per company:
  - Sales: leads, close rates, pipeline value
  - Production: jobs in progress, cycle times, delay reasons
  - Materials: waste, overruns
  - Financials: revenue, margin, AR, cash flow
  - Service: response times, NPS/review proxies

Feeds company-wide performance engine and dashboards.

### Helper Library

New TS utilities in `src/lib/unified-data.ts`:

- `getUnifiedCustomer(customerId | leadId)`
- `getUnifiedJob(jobId)`
- `getUnifiedCompanySnapshot(companyId)`

These wrap Supabase queries to the `*_unified_view` views and are reused by APIs, AI tools, and dashboards.

---

## 4. AI Context Sharing (AI Always Knows the Full Situation)

### Goal

Make every AI feature in SmartSend **context-aware across ALL modules**.

### Library: `src/lib/ai-context.ts`

Implement a centralized context builder used by all AI calls:

- `buildJobAIContext(jobId)`
  - Pulls from `job_unified_view`
  - Includes: scope, materials, schedule, crew, weather, photos, inspections, customer communication summary

- `buildCustomerAIContext(customerId | leadId)`
  - Pulls from `customer_unified_view`
  - Includes: jobs, service history, sentiment, last contact, open issues

- `buildCompanyAIContext(companyId)`
  - Pulls from `company_performance_view`
  - Includes: current performance, bottlenecks, forecasts

- `buildFullEcosystemContext(args)`
  - Combines relevant job + customer + company context depending on the use case

### Integration Points

We update existing AI features to use the new context builder instead of ad-hoc queries:

- **AI reply composer** — uses job + customer context to give accurate, timeline-aware replies.
- **AI scheduling assistant** — uses crew schedules, weather, and capacity forecasts.
- **AI follow-up brain** — uses pipeline, job momentum, and homeowner tone.
- **Executive Brain insights** — uses company performance and forecasting.

Example: When AI writes:

> "Your materials will be delivered tomorrow between 8–10 AM. Crew B will start at 11 AM. Weather looks clear until 4 PM."

…it’s **reading live data** from schedules, materials, and forecast tables via the unified context builder.

---

## 5. Multi-Module Dashboard (Master Control Center)

### Goal

Give the owner **one screen that shows the entire company** — sales, production, materials, payroll, subs, AR, profit, reviews, customer requests, forecasting, and executive alerts.

This extends the existing **Daily Command Center** into a true **Ecosystem Sync dashboard**.

### Frontend

- New page: `/dashboard/ecosystem-sync`
- Components (under `src/components/dashboard/ecosystem/`):
  - `EcosystemSummaryHeader` — high-level snapshot (Today, This Week, This Month)
  - `SalesToProductionFlowCard` — where jobs are getting stuck in handoffs
  - `ProductionLoadAndCrewCapacityCard` — crew utilization, bottlenecks
  - `MaterialsAndInventoryCard` — upcoming jobs vs materials readiness
  - `BillingAndCashFlowCard` — AR, payments, forecast
  - `ServiceAndWarrantyCard` — open tickets, SLA breaches, upcoming expirations
  - `SubsAndComplianceCard` — subs performance, missing docs, overcharge flags
  - `ExecutiveAlertsFeed` — cross-system alerts (e.g. high-value job at risk)

### API

- `GET /api/ecosystem/overview`
  - Aggregates data from unified views + existing metrics tables
  - Returns single payload for the dashboard

We reuse the same data layer as the performance engine and forecasting; **no duplicate logic**.

---

## 6. Company-Wide Performance Engine

### Goal

Turn **data from every module** into **NFL-level analytics** for roofing companies.

### Metrics

We compute and expose metrics such as:

- Company margin
- Average job duration
- Crew ranking (speed, quality, callbacks)
- PM ranking
- Sub ranking (on-time, accurate billing, callbacks)
- Customer satisfaction (proxy via CSAT/NPS/reviews/complaints)
- Cost per square
- Revenue per crew per day
- Forecast accuracy (forecast vs actual)
- Job delay root causes
- Service response times

### Implementation

- **Table: `company_kpi_snapshots`**
  - `id`, `company_id`, `period` (`daily`/`weekly`/`monthly`), `period_start`, `period_end`
  - `metrics` (jsonb) — structured object with all KPIs for that period
  - `created_at`

- **Edge function / worker: `compute-company-kpis`**
  - Runs nightly (and on-demand for dashboards)
  - Reads from:
    - `job_unified_view`
    - `revenue_forecasts`
    - `job_costs` / `job_cost_items`
    - `crew_assignments`, `job_day_schedules`
    - `service_tickets`
    - `messages` / sentiment scores
  - Writes summary objects into `company_kpi_snapshots`

- **API**
  - `GET /api/performance/company` — returns latest KPIs and trend lines

Dashboards and the Executive Brain use this instead of ad-hoc queries.

---

## 7. Predictive Automations

### Goal

Use patterns and intelligence from the data brain to **auto-adjust the system**:

- Overloaded crews → auto-shift jobs
- Materials waste patterns → auto-adjust estimates
- Margin drops → recommend price or process changes
- High satisfaction → trigger referral campaigns

### Implementation

- **Table: `predictive_recommendations`**
  - `id`, `company_id`, `kind` (e.g. `crew_overload`, `margin_drop`, `waste_pattern`, `referral_opportunity`)
  - `status` (`pending`, `applied`, `dismissed`)
  - `severity` (`info`, `warning`, `critical`)
  - `context` (jsonb) — entities involved, metrics, suggested actions
  - `created_at`, `acted_at`, `acted_by`

- **Worker: `run-predictive-automations`**
  - Runs periodically, reading from KPIs and unified data views
  - Creates `predictive_recommendations`
  - For certain patterns (where company has enabled "auto-apply") it **executes actions automatically**:
    - Reassign jobs from overloaded Crew A to Crew B
    - Increase estimate templates by X% where chronic under-margin is detected
    - Auto-create targeted referral campaigns when CSAT/high NPS is detected

- **UI Integration**
  - `ExecutiveAlertsFeed` shows recommendations
  - Owner can mark them as applied/dismissed or enable "auto-pilot" for some categories

---

## 8. End-to-End Automation (Lead → Job → Warranty → Service → Repeat)

### Goal

Make SmartSend the **only system in roofing** where:

- Sales
- Production
- Operations
- Financials
- Customer experience
- Service
- Warranty
- Subcontractors
- Forecasting
- Executive intelligence

…all run in **one continuous, automated loop**.

### Example Journey: Lead → Raving Fan + Referral

1. **Lead Created** → estimate scheduled via AI scheduling.
2. **Estimate Accepted** (`estimate_accepted` event) → job created, contract + portal + PM assignment + material calc + forecast.
3. **Job In Production** → crews scheduled, materials ordered, homeowner receives automatic updates (AI-written, context-aware).
4. **Inspection Passed / Job Completed** → invoice auto-generated, profit engine kicks in.
5. **Payment Received** → revenue & profit update, executive dashboards refresh automatically.
6. **Warranty Started** → warranty record created, future reminders scheduled.
7. **Service Request (if any)** → service ticket created, context includes original job details, materials, photos.
8. **High Satisfaction Detected** → predictive automation triggers referral campaign.

At every step, the **global event bus** fires, the **unified data layer** updates, the **AI brain** understands the full situation, and the **dashboards + KPIs** stay accurate.

---

## Phased Implementation Plan

Because this touches the entire ecosystem, we ship in controlled phases:

1. **Phase 1 — Global Event Backbone**
   - Implement `global_events` + `emit_global_event`
   - Wire into: estimates, jobs, invoices/payments, service tickets, warranties
   - Build `process-global-events` worker with logging and basic observability

2. **Phase 2 — Core Cross-System Flows**
   - Sales → Production automation for `estimate_accepted` / `contract_signed`
   - Production → Billing automation for `inspection_passed` / `job_completed`
   - Billing → Executive automation for `payment_received`

3. **Phase 3 — Unified Views + AI Context**
   - Ship `customer_unified_view`, `job_unified_view`, `company_performance_view`
   - Implement `ai-context` library and update top AI features to use it

4. **Phase 4 — Ecosystem Dashboard + Performance Engine**
   - Build `/dashboard/ecosystem-sync`
   - Implement `company_kpi_snapshots` + `compute-company-kpis`

5. **Phase 5 — Predictive Automations**
   - Implement `predictive_recommendations` and `run-predictive-automations`
   - Wire critical auto-adjustments & referral triggers

---

## Testing Strategy

- **Unit tests** for `emit_global_event`, event handlers, and AI context builders.
- **Integration tests** for core flows (Sales → Production, Production → Billing, Billing → Executive Brain).
- **End-to-end scenarios** in staging that simulate:
  - New lead through job completion and payment
  - Warranty expiry and service request
  - Crew overload / materials waste / margin drop patterns
- **Observability**
  - Log and surface event processing errors
  - Dashboard section showing recent global events and their downstream actions

---

## Business Impact

With Block 258000 shipped:

- SmartSend becomes the **first true operating system for roofing companies**.
- Roofers go from juggling **6–10 disconnected apps** to **one brain that runs everything**.
- Hand-offs (sales → production → billing → service) become **instant and automatic**.
- Data is **fully aligned** across modules, powering AI, forecasting, and decision-making.
- Roofers will say: **"SmartSend runs our entire company. We’d be stupid not to use this."**













