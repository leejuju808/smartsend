# Block 258100 — SmartSend Integration Hub v1

## Overview

**INTEGRATION HUB v1 — ZERO BULLSHIT.**  
This block takes the existing Integrations Hub, Accounting Engine, Supplier Network, Email/Calendar providers, and Global Event System and turns SmartSend into the **single command center** for a roofer’s entire tech stack.

Roofing companies connect SmartSend to **QuickBooks, Zapier, SRS/ABC/Beacon, Google Calendar, Gmail/Outlook, and phone systems**. From that moment on, SmartSend becomes the **source of truth** for jobs, money, schedules, materials, and communication.

This block is about **shipping the full, working hub**, not just schema:
- **QuickBooks full bi-directional sync** (invoices, payments, AR, customers)
- **Zapier integration** with production-grade triggers & actions
- **Supplier integrations** (SRS, ABC, Beacon) on top of Supplier Network v1
- **Google Calendar sync** for jobs, crews, PMs, and owners
- **Email sync** (Gmail + Outlook) tied to jobs and customers
- **Phone system log sync** (RingCentral, Grasshopper, Dialpad)
- **Webhook system** for agencies and custom integrations
- **Integration Status Dashboard** that shows everything at a glance

Combined with Block 258000 (Global Event System) and Block 25740 (Integrations Hub DB), this makes SmartSend the **integration backbone** of a roofing company.

---

## Implementation Summary

### Existing Foundations Reused

We **do not reinvent plumbing**. This block builds directly on:

- **Block 25740 — Integrations Hub v1**
  - `integrations` table with multiple provider types (Gmail, Outlook, QuickBooks, Calendar, etc.)
  - Core tables: `phone_calls`, `calendar_events`, `push_notification_devices`, `push_notifications`, `supplier_purchase_orders`, etc.
- **Block 257100 — Accounting & Billing Engine v1**
  - `invoices`, `payments`, `ar_followups`, `job_costs`, `accounting_sync`
- **Block 254800 — Supplier & Material Network v1**
  - `suppliers`, `materials_catalog`, extended `purchase_orders`, `material_deliveries`, `yard_inventory`, `material_availability_alerts`
- **Block 258000 — Full Ecosystem Sync v1**
  - `global_events` and automation flows
- **Email Provider Blocks**
  - Gmail & Outlook integrations
  - Provider webhooks / polling
  - Unified inbox and reply detection

### New Capabilities Shipped in 258100

1. **QuickBooks Full Sync** — real two-way accounting integration, wired to `invoices`, `payments`, and `accounting_sync`.
2. **Zapier Integration** — production Zapier app with SmartSend triggers & actions for 6,000+ tools.
3. **Supplier Integrations (SRS, ABC, Beacon)** — live API-powered pricing + PO sync, on top of Supplier Network v1.
4. **Google Calendar Sync** — job, crew, and PM scheduling synced into Google Calendar.
5. **Email Sync (Gmail + Outlook)** — full-thread sync tied to jobs, leads, and service tickets.
6. **Phone System Sync** — normalized call logs from RingCentral, Grasshopper, Dialpad into `phone_calls`.
7. **Webhook System for Custom Integrations** — organization-defined webhooks for key business events.
8. **Integration Status Dashboard** — one screen that shows every integration and its health.

---

## 1. QuickBooks Full Sync

### Goal

**Real** accounting integration — not a CSV export.  
Invoices, payments, customers, and AR **stay in lockstep** between SmartSend and QuickBooks.

### Database

We **reuse** the existing `accounting_sync` and `invoices`/`payments` tables from Block 257100 and extend minimally:

- **Extend `accounting_sync`** (if not already present):
  - `provider` (`text`) — e.g. `quickbooks_online`, `quickbooks_desktop` (enum-like constraint)
  - `tenant_id` (`text`) — QuickBooks realm ID / company ID
  - `access_token` (`text`, encrypted)
  - `refresh_token` (`text`, encrypted)
  - `expires_at` (`timestamptz`) — access token expiry
  - `last_sync_at` (`timestamptz`) — last successful sync
  - `sync_direction` (`text`) — `one_way`, `two_way` (we use `two_way` here)
  - `config` (`jsonb`) — mapping flags (e.g. income accounts, tax codes)

- **New table: `quickbooks_sync_logs`**
  - `id` (uuid, pk)
  - `company_id` (uuid, indexed)
  - `provider` (text) — `quickbooks_online` | `quickbooks_desktop`
  - `direction` (text) — `push` | `pull`
  - `entity_type` (text) — `invoice` | `payment` | `customer`
  - `entity_id` (uuid, nullable) — local entity id
  - `external_id` (text, nullable) — QuickBooks id
  - `status` (text) — `success` | `error`
  - `error_message` (text, nullable)
  - `payload` (jsonb) — snapshot for debugging
  - `created_at` (timestamptz default now())

RLS: scoped by `company_id` so each company only sees its own history.

### API & Edge Functions

**OAuth & configuration** (Next.js API):

- `GET /api/integrations/quickbooks/start`
  - Starts QuickBooks OAuth (Online) and stores state.
- `GET /api/integrations/quickbooks/callback`
  - Completes OAuth, stores tokens in `accounting_sync` row for the company.

**Sync endpoints / workers**:

- `POST /api/integrations/quickbooks/sync`
  - Kicks off a background sync job (for manual “Sync Now” from UI).
- Edge Function: `quickbooks-sync`
  - Runs on schedule (e.g. every 5–10 minutes) and when manually triggered.
  - **Pulls from QuickBooks**:
    - New/updated `customers` → upserts into SmartSend customers.
    - New/updated `invoices` → upserts into SmartSend `invoices` & AR.
    - `payments` → upserts into `payments` and updates invoice balances.
  - **Pushes to QuickBooks**:
    - Newly created / updated SmartSend `invoices` (not yet synced or changed since last sync).
    - New `payments` recorded in SmartSend.
    - New/updated customers created in SmartSend.
  - Updates `quickbooks_sync_logs` and `accounting_sync.last_sync_at`.

### Event Wiring

Use **Global Event System** from Block 258000:

- On SmartSend side:
  - `invoice_created` / `invoice_updated` / `payment_received` → emit events.
  - Event handlers enqueue QuickBooks push jobs.
- On QuickBooks side:
  - Changes detected during sync emit `accounting_entity_synced` events so dashboards/AI stay current.

### Example Flow

- PM creates Invoice **#882** in SmartSend.
- Event `invoice_created` fires → handler enqueues QuickBooks push.
- Edge Function maps invoice → QuickBooks Invoice, stores external id.
- Later, office marks payment in QuickBooks for `$4,900`.
- Next sync run pulls `Payment` + updated `Invoice` → creates `payments` row in SmartSend, updates invoice `paid_amount`.
- AR dashboards and cashflow forecasts update automatically.

---

## 2. Zapier Integration (Triggers + Actions)

### Goal

Turn SmartSend into the **automation brain** that can connect to 6,000+ apps without custom dev.

### Database

We reuse the existing `integrations` table with `type = 'zapier'` (see `docs/INTEGRATIONS_SYSTEM.md` and Enterprise Integrations):

- `integrations` row example:
  - `type`: `zapier`
  - `config`: `{ "url": "https://hooks.zapier.com/hooks/catch/...", "events": ["job_created", "invoice_overdue"] }`

Optional: introduce a more granular subscription table if needed later (`integration_event_subscriptions`). For v1, a per-org Zapier hook with event filters is enough.

### Triggers Implemented

Backed by **`global_events`** and accounting/service modules:

- `job_created`
- `estimate_accepted`
- `invoice_overdue`
- `service_request_created`
- `review_received`
- `payment_received`
- `material_delivery_verified`

Each trigger sends a **normalized payload**:

```json
{
  "event": "invoice_overdue",
  "company_id": "...",
  "workspace_id": "...",
  "timestamp": "2025-03-01T10:00:00Z",
  "job": { "id": "...", "name": "Job #1103", "address": "..." },
  "customer": { "id": "...", "name": "Sarah", "email": "..." },
  "invoice": { "id": "...", "number": "882", "amount": 4900, "due_date": "..." }
}
```

### Actions Supported

Zapier **action endpoints** (Next.js API):

- `POST /api/integrations/zapier/actions/create-lead`
- `POST /api/integrations/zapier/actions/send-slack`
- `POST /api/integrations/zapier/actions/add-google-sheet-row`
- `POST /api/integrations/zapier/actions/add-mailing-list-contact`

These map directly into existing internal APIs (`leads`, notifications, etc.). Zapier can call them through the Zapier app, but **no roofer code is required**.

### Implementation

- New route: `POST /api/integrations/zapier/webhook`
  - Receives internal events (from the global handler) and fan-outs to all Zapier hooks for that company.
- Zapier app configuration mirrors Enterprise Integrations patterns but with **roofing-specific events**.

---

## 3. Supplier Integrations (SRS, ABC, Beacon)

### Goal

Take **Supplier Network v1** (Block 254800) from “schema ready” to **live API-powered** integrations with SRS, ABC, and Beacon — so PMs see real-time pricing & availability and send POs directly.

### Database

We **reuse and extend**:

- `suppliers` — already has `integration_type`, `integration_config`, `api_enabled`.
- `materials_catalog` — real-time pricing per supplier.
- `purchase_orders`, `material_deliveries` — POs and delivery tracking.

We enrich `integration_config` per supplier with API details, for example:

```json
{
  "api_key": "...",
  "base_url": "https://api.abc.com/v1",
  "auth_type": "token",
  "branch_id": "Tacoma-01"
}
```

### Edge Functions & Services

- `supabase/functions/supplier-srs-sync`
- `supabase/functions/supplier-abc-sync`
- `supabase/functions/supplier-beacon-sync`

Each function:

- Authenticates against supplier API.
- Pulls **price lists**, availability, and lead times into `materials_catalog`.
- Optionally pulls PO status back into `purchase_orders` & `material_deliveries`.

### API Routes

- `POST /api/integrations/suppliers/[supplier]/sync-pricing`
  - Triggers on-demand sync for SRS/ABC/Beacon.
- `POST /api/integrations/suppliers/[supplier]/po`
  - Sends PO to supplier via API and updates `purchase_orders` status to `sent` / `confirmed`.

### UX Flow

- PM opens Job #1103 → Materials tab.
- SmartSend calls supplier APIs and shows:
  - **SRS**: Timberline HDZ — In Stock (Tacoma), Delivery tomorrow AM, Price $123/sq.
- PM clicks **“Send PO to ABC”**.
- SmartSend:
  - Builds PO payload from `auto_calculated_materials`.
  - Sends via API.
  - Logs `PO #1180 sent to ABC Supply, Delivery window: 8–10 AM Tuesday`.

---

## 4. Google Calendar Sync

### Goal

Make **job schedules, inspections, crew assignments, and owner meetings** show up automatically on Google Calendar.

### Database

We reuse `calendar_events` from Block 25740 and extend `integrations` with `type = 'google_calendar'` with OAuth tokens in `config`.

`calendar_events` already tracks:
- `event_type`: `inspection`, `quote`, `material_delivery`, `install`, `crew_schedule`, `owner_meeting`, etc.
- External calendar IDs and sync state.

### OAuth & Sync

- `GET /api/integrations/google-calendar/start`
- `GET /api/integrations/google-calendar/callback`
  - Store refresh token and calendar id(s) in `integrations.config`.

- `POST /api/integrations/google-calendar/sync`
  - For a workspace/company, syncs `calendar_events` ↔ Google Calendar events.

### Wiring to Jobs & Crews

- When a job is scheduled, inspection created, or crew assigned:
  - Create/Update `calendar_events` rows.
  - Global event `calendar_event_created` / `calendar_event_updated` fires.
  - Calendar integration handler ensures Google Calendar is updated.

Example:

- Job #1103 scheduled Monday 8 AM–4 PM with Crew A.
- SmartSend creates `calendar_events` for Crew A + PM + Owner.
- Events push to the linked Google Calendars.
- Homeowner & crew receive native Google notifications.

---

## 5. Email Sync (Gmail + Outlook)

### Goal

Unify **Gmail + Outlook** threads so SmartSend always knows the full conversation history, and attach everything to the right job/lead.

### Building Blocks

- Gmail integration (Edge functions + `user_email_providers`).
- Outlook integration (`connected_accounts`, Graph API, polling route).
- Inbound provider webhooks (SendGrid/Postmark/Mailgun normalization).
- Unified inbox + `email_messages` / `provider_messages`.

### Enhancements in 258100

- **Thread-to-entity linking logic**:
  - Map emails to **jobs**, **leads**, or **service tickets** using:
    - Address lookup (lead/customer email).
    - Special SmartSend job tags in subject or hidden headers.
  - Persist these mappings so future messages in the same thread auto-link.

- **Tasks & timeline hooks**:
  - New function: `create_task_from_email(email_id, job_id, reason)`.
  - Example: Email from Sarah: "Can I change shingle color?" → task auto-created for PM, email linked to job timeline.

No new tables are required; we extend existing mapping fields and add helper functions in `src/lib/inbox-linking.ts`.

---

## 6. Phone System Sync (RingCentral, Grasshopper, DialPad)

### Goal

Centralize all **call logs, voicemails, and missed calls** into SmartSend, tied to customers and jobs.

### Database

We use the `phone_calls` table from Block 25740:
- Call metadata (from/to, duration, status).
- Outcome tagging.
- Links to jobs/leads.

We extend `integrations` with `type` values:
- `ringcentral`
- `grasshopper`
- `dialpad`

Each provider’s tokens/URLs live in `integrations.config`.

### Webhook Endpoints

New API routes:

- `POST /api/integrations/phone/ringcentral`
- `POST /api/integrations/phone/grasshopper`
- `POST /api/integrations/phone/dialpad`

Each endpoint:

1. Verifies provider signature / secret.
2. Normalizes payload to a shared `NormalizedCall` type:
   - `from`, `to`, `duration_seconds`, `direction`, `status`, `started_at`, `ended_at`, `recording_url`, `voicemail_text`.
3. Resolves `customer_id` and `job_id` from phone number and context.
4. Inserts into `phone_calls` and emits `phone_call_logged` / `missed_call_created` events.
5. For missed calls from known leads/customers with no job → create or update service request.

Example:

- Missed call 9:14 AM from Tony.
- System matches Tony to Job #1109.
- Creates service request for Job #1109 and surfaces it on the dashboard.

---

## 7. Webhook System for Custom Integrations

### Goal

Give agencies and advanced roofers a **first-class webhook layer** so they can plug SmartSend into any custom system without waiting on native integrations.

### Database

New table: `webhook_subscriptions`:

- `id` (uuid, pk)
- `company_id` (uuid, indexed)
- `name` (text) — e.g. "Job → Custom ERP"
- `target_url` (text)
- `secret` (text, hashed/secure)
- `events` (text[]) — e.g. `{job_created, job_updated, invoice_paid, material_order_sent, crew_checked_in}`
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

New table: `webhook_delivery_logs`:

- `id` (uuid, pk)
- `subscription_id` (uuid, fk → `webhook_subscriptions`)
- `event_type` (text)
- `status` (text) — `success` | `retrying` | `failed`
- `response_status` (int, nullable)
- `error_message` (text, nullable)
- `payload` (jsonb)
- `attempts` (int)
- `created_at`

RLS: locked by `company_id` so each org only sees its own sub & logs.

### Event Coverage

Subscribed events (using global event system):

- `job_created`, `job_updated`
- `invoice_created`, `invoice_paid`
- `permit_approved`
- `material_order_sent`
- `crew_checked_in`
- `service_request_created`

### Delivery Worker

Edge Function: `webhook-dispatcher`:

- Polls new unprocessed `global_events`.
- For each event, finds all active `webhook_subscriptions` whose `events` array includes that event type.
- Sends signed POST requests with payload:

```json
{
  "event_type": "job_created",
  "company_id": "...",
  "created_at": "...",
  "payload": { /* normalized entity payload */ }
}
```

- Signs using `HMAC(secret, body)` into `x-ss-signature` header.
- Implements basic retry (e.g. exponential backoff up to N attempts).

---

## 8. Integration Status Dashboard

### Goal

Give owners and ops leaders **one page** that shows whether SmartSend is talking to **everything** — and if not, why.

### API

- `GET /api/integrations/status`
  - Aggregates data from:
    - `integrations` (connection status & last sync).
    - `quickbooks_sync_logs`.
    - Supplier sync functions / last price sync timestamps.
    - `webhook_delivery_logs`.
    - Email & phone provider heartbeat checks.
  - Returns a normalized array like:

```json
[
  { "name": "QuickBooks", "status": "connected", "last_sync_at": "...", "details": "Invoices & payments syncing" },
  { "name": "Zapier", "status": "connected", "details": "3 active zaps" },
  { "name": "SRS API", "status": "online", "last_sync_at": "..." },
  { "name": "ABC", "status": "sync_delay", "details": "Last price sync 2 minutes ago" },
  { "name": "Google Calendar", "status": "connected" },
  { "name": "Email Sync", "status": "active", "details": "Gmail + Outlook" },
  { "name": "Phone Log Sync", "status": "connected" },
  { "name": "Webhooks", "status": "healthy", "details": "24 events, 0 failed in last hour" }
]
```

### UI

New page under dashboard, e.g. `/dashboard/integrations`:

- **Integration cards**:
  - QuickBooks, Zapier, SRS, ABC, Beacon, Google Calendar, Gmail, Outlook, RingCentral, Grasshopper, DialPad, Webhooks.
- Each card shows:
  - Connection status (Connected / Not connected / Error / Sync delay).
  - Last sync time.
  - CTA buttons: Connect, Reconnect, Manage.
- Includes small log panel: “Last webhook events: 24 successful, 0 failed”.

Tech-savvy roofers will live here.

---

## Phased Implementation Plan

Because this Hub touches many existing systems, we ship in **tight, production-safe phases**:

1. **Phase 1 — QuickBooks Full Sync**
   - Implement OAuth, token storage, and sync service.
   - Wire invoices & payments both ways.
   - Build basic sync history view.

2. **Phase 2 — Zapier Triggers & Actions**
   - Wire global events into Zapier triggers.
   - Expose core actions (create lead, send Slack, add sheet row, fire webhook).

3. **Phase 3 — Supplier APIs (SRS/ABC/Beacon)**
   - Implement price sync + PO send for at least one supplier, then template for others.
   - Connect to materials engine and purchase orders.

4. **Phase 4 — Google Calendar + Email Sync Enhancements**
   - Ship Google Calendar OAuth + event sync.
   - Finalize thread-to-job/lead linking for email.

5. **Phase 5 — Phone System Sync + Webhook System**
   - Implement normalized phone webhooks + phone_calls ingestion.
   - Ship webhook subscriptions & dispatcher worker.

6. **Phase 6 — Integration Status Dashboard**
   - Build `/dashboard/integrations` view.
   - Wire into all previous phases for real-time status.

---

## Testing Strategy

- **Unit tests**
  - QuickBooks mappers (invoice, payment, customer).
  - Supplier API mappers → `materials_catalog` and `purchase_orders`.
  - Webhook signature verification & retry logic.

- **Integration tests**
  - End-to-end QuickBooks sync using sandbox.
  - Zapier trigger delivery to test hook URLs.
  - Supplier API mocks for SRS/ABC/Beacon.
  - Google Calendar event create/update/delete round-trips.

- **End-to-end flows**
  - Job sold → invoice created in SmartSend → appears in QuickBooks → payment logged in QuickBooks → appears in SmartSend.
  - Material order created in SmartSend → PO sent to ABC → status updates on delivery.
  - Missed call on RingCentral → service request created + visible in dashboard.
  - Webhook subscriber receives job_created and invoice_paid events reliably.

- **Observability**
  - Logs and metrics for every integration.
  - Integration Status Dashboard surfaces errors and last sync times.

---

## Business Impact

With Block 258100 shipped, SmartSend becomes the **integration backbone** of a roofing company:

- Accounting, materials, scheduling, email, calls, and automations are all **wired to one brain**.
- Double entry disappears; QuickBooks, suppliers, and calendars just **follow SmartSend**.
- Every integration has a clear status and health view.
- Roofers will say:
  - "SmartSend talks to EVERYTHING."
  - "We eliminated 90% of manual double entry."
  - "Any roofer not using SmartSend is living in the stone age."













