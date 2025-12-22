# SmartSend AI ⚡ — Cold Email Operating System (MVP)

End-to-end cold outreach: **Import → Schedule/Send → Queue (Retry/Cancel) → Auto-Reply Detection → Dashboard + Billing.**

## Stack

- **Frontend**: Next.js (App Router) + Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres, Auth, RLS, Edge Functions)
- **Billing**: Stripe (Checkout + Billing Portal)
- **AI**: OpenAI (reply classification)
- **Integrations**: Postmark / Gmail / Outlook webhooks (via Zapier/Make or native)

---

## Key Features

- CSV Lead Importer with mapping, Zod validation, dedupe, downloadable **error CSV**
- Send Queue with **Bulk Retry**, **Cancel**, selection toolbar, filters, export
- **Auto-Reply Detection** (Edge Function) → marks lead `replied`, logs event, cancels future steps
- Logs Drawer (per row) + Row Actions menu
- **Billing gates**: Starter (1 campaign, 2k rows/import), Pro (configurable)
- Clean UX polish: status pills, attempt chip, skeletons, empty states, CSV export

---

## Repo Layout (relevant)

/app

/api

/billing

/checkout/route.ts

/portal/route.ts

/webhook/route.ts

/me/route.ts

/campaigns

/list/route.ts

/create/route.ts

/leads/import/route.ts

/logs/search/route.ts

/queue

/retry/route.ts

/cancel/route.ts

/search/route.ts

/export/route.ts

/components

/billing/UpgradeModal.tsx

/leads/LeadImportSheet.tsx

/queue/QueueTable.tsx

/queue/SelectionToolbar.tsx

/queue/RowActions.tsx

/queue/LogsDrawer.tsx

/ui/status-pill.tsx

/ui/table-skeleton.tsx

/ui/empty-state.tsx

/lib

/billing/entitlements.ts

/billing/getUserPlan.ts

/supabase/server.ts

/validators/lead.ts

/supabase/functions/replyDetection/index.ts

/sql

001_leads_guardrails.sql

002_retry_failed_queue.sql

003_cancel_queue.sql

004_reply_detection.sql

005_logs_view.sql

006_campaigns_view.sql

007_billing_subscriptions.sql

---

## Environment Variables

**Next.js / Supabase**

NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_SITE_URL= # e.g., https://app.smartsend.ai

**OpenAI**

OPENAI_API_KEY= # set in Supabase Function env (replyDetection)

**Stripe**

STRIPE_SECRET_KEY=

STRIPE_WEBHOOK_SECRET=

STRIPE_PRICE_PRO=price_xxx # Stripe Price ID for Pro plan

**Reply Detection**

REPLY_WEBHOOK_SECRET= # shared secret header checked by Edge Function

---

## Database & Functions (run in order)

Execute each SQL in Supabase SQL Editor (or psql):

1. `001_leads_guardrails.sql` — unique `(campaign_id, email)` index  
2. `002_retry_failed_queue.sql` — RPC: `retry_failed_queue(p_ids uuid[])`  
3. `003_cancel_queue.sql` — RPC: `cancel_queue(p_ids uuid[])`  
4. `004_reply_detection.sql` — columns + `inbound_logs` + `send_queue_view`  
5. `005_logs_view.sql` — `campaign_logs_view` (+ index on `meta->>'queue_id'`)  
6. `006_campaigns_view.sql` — lightweight campaigns list view  
7. `007_billing_subscriptions.sql` — billing storage

**Edge Function deploy**

```bash
supabase functions deploy replyDetection --no-verify-jwt

# Set function env in Supabase: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REPLY_WEBHOOK_SECRET
```

## API Routes (App Router)

### Leads

POST /api/leads/import — validate + dedupe + bulk insert; returns counts and errorCsv

### Queue

POST /api/queue/retry — calls retry_failed_queue

POST /api/queue/cancel — calls cancel_queue

GET /api/queue/search — filters: status, campaignId, start, end

GET /api/queue/export — CSV export with same filters

### Logs

GET /api/logs/search — by queueId or leadId

### Campaigns

GET /api/campaigns/list — id/name for filters & pickers

POST /api/campaigns/create — plan-gated create

### Billing

POST /api/billing/checkout — Stripe Checkout (Pro)

POST /api/billing/portal — Stripe Billing Portal

POST /api/billing/webhook — Stripe webhook (set endpoint in Stripe)

GET /api/billing/me — entitlements for UI (plan, maxCampaigns, maxImportRows)

### Supabase Edge Function

POST https://<project-ref>.functions.supabase.co/replyDetection

Headers: Content-Type: application/json, X-Reply-Secret: <REPLY_WEBHOOK_SECRET>

## Local Dev

```bash
# install
npm i

# env
cp .env.example .env.local
# fill with Supabase/Stripe keys; for functions, set env in Supabase dashboard

# dev
npm run dev
```

### Stripe webhook (local)

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
# then place the printed signing secret into STRIPE_WEBHOOK_SECRET
```

## Reply Detection Integrations

You can wire any provider to the Edge Function by POSTing JSON:

```json
{
  "provider": "postmark|gmail|outlook|sendgrid|mailgun",
  "thread_id": "provider-thread-or-conversation-id",
  "message_id": "message-id",
  "subject": "Re: ...",
  "body": "Plaintext body preferred",
  "from_email": "prospect@company.com",
  "to_email": "you@smartsend.ai"
}
```

Postmark: Inbound → Zapier → Code step normalizes → Webhook POST (include X-Reply-Secret).

Gmail: Zapier “New Email Matching Search” → normalize → POST.

Outlook: Zapier “New Email” or Microsoft Graph subscriptions → normalize → POST.

The function:

- Classifies with OpenAI
- If human reply, sets leads.status='replied', logs lead_replied, and cancels queued items for that lead
- Optional: flags unsubscribed when content indicates opt-out

## UI Highlights

- LeadImportSheet: file drop → map columns (Email*, First, Last, Company) → validate → import → download errors
- QueueTable: header checkbox, selection toolbar (Retry Failed, Cancel Selected), status pills, attempt chip
- Filters: status, campaign, date range
- Export CSV: exports the filtered view
- RowActions: View Logs, Copy Last Error, Retry, Cancel
- LogsDrawer: activity feed per queue/lead
- Billing: Upgrade modal + Starter/Pro gates
- Empty/Skeleton: clean first-load UX

## E2E Happy-Path Test (5 minutes)

Seed a campaign, lead, and queue row (mark as sent)

```sql
insert into public.campaigns (id, name, created_at)
values (gen_random_uuid(), 'MVP Test', now())
returning id;                     -- -> :campaign_id

insert into public.leads (id, campaign_id, email, status, created_at)
values (gen_random_uuid(), :campaign_id, 'prospect+test@example.com', 'queued', now())
returning id;                     -- -> :lead_id

insert into public.send_queue (id, campaign_id, lead_id, status, attempt_count, max_attempts, updated_at, thread_id, provider)
values (gen_random_uuid(), :campaign_id, :lead_id, 'sent', 1, 3, now(), 'thread-demo-123', 'test')
returning id;
```

Simulate a reply into the Edge Function

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/replyDetection" \
  -H "Content-Type: application/json" \
  -H "X-Reply-Secret: <REPLY_WEBHOOK_SECRET>" \
  -d '{
    "provider":"test",
    "thread_id":"thread-demo-123",
    "message_id":"m-1",
    "subject":"Re: Pricing",
    "body":"Yes, let us proceed.",
    "from_email":"prospect+test@example.com",
    "to_email":"you@smartsend.ai"
  }'
```

Verify DB

```sql
select status from public.leads where email='prospect+test@example.com'; -- replied
select event, meta from public.campaign_logs where lead_id=:lead_id order by created_at desc limit 3; -- includes lead_replied
select count(*) from public.send_queue where lead_id=:lead_id and status in ('queued','sending'); -- 0
```

## UI

- Queue page shows status pills & attempts
- Row actions (Logs/Retry/Cancel) behave as expected
- Export CSV works with filters

## Billing Gates — Quick QA

```bash
GET /api/billing/me → { plan, maxCampaigns, maxImportRows }
```

- Try creating a 2nd campaign on Starter → 402 with LIMIT_REACHED (Upgrade modal)
- Try importing >2000 rows on Starter → 402 IMPORT_LIMIT
- POST /api/billing/checkout → Stripe Checkout opens; after test payment, webhook sets plan=pro
- Gates lift automatically

## Security Notes

- Edge Function enforces X-Reply-Secret; rotate per environment
- Use Service Role key only on server routes / functions (never in client)
- Consider RLS on leads, send_queue, campaigns, campaign_logs per owner_id/workspace

## Troubleshooting

- Reply not matching: ensure you store provider thread_id on send; function falls back to from_email
- Webhook 401: missing/incorrect X-Reply-Secret
- Stripe webhook error: run stripe listen locally and set STRIPE_WEBHOOK_SECRET
- Import errors: download error CSV and check invalid emails / duplicates by campaign

## License

Internal MVP. © SmartSend AI.

---

You’re good to ship. If you want, I can also generate a minimal **/docs** site page from this README.

# SmartSend AI — Cold Email Copilot

**North Star:** `MB/100 = Meetings Booked per 100 Replies`  
**Company Goal:** $1M ARR. Every slice should increase MB/100 and paid conversions.

---

## Product Wedge (v1)
1. **Reply-Intent Detector → Auto Calendar Insert**
   - Intents: `meeting`, `positive`, `neutral`, `not_interested`, `unsubscribe`, `complaint`, `bounce_hard`, `bounce_soft`
   - Auto ICS + Calendly on `meeting`
   - **Auto-suppress negatives**: `unsubscribe`, `complaint`, `bounce_hard`

2. **CSV Import → Dedupe → Suppression Guard**
   - Column mapping UI
   - In-file dedupe, invalid email skip
   - Skip existing contacts, skip suppressed (global & per-campaign)
   - Summary counts + sample errors

3. **Send Safety**
   - Global suppressions (`suppressions`) + per-campaign suppressions (`campaign_suppressions`)
   - Helper: `is_suppressed(workspace, email, campaign?)`
   - **Next:** Pre-send guard (visible alert + counts)

4. **Lite Analytics**
   - MB/100 spotlight
   - Replies → meetings %
   - Basic sender health

---

## Tech Stack (non-negotiable)
- **Next.js 14+ App Router**, TypeScript, Tailwind, shadcn/ui, lucide-react
- **Supabase** (Postgres + Auth + RLS)
- **Stripe** (Checkout, Billing, Webhooks) with `profiles.subscription_status`
- **Vercel** deployment

**Env placeholders (do not hardcode secrets):**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PRICE_ID=
INTERNAL_API_KEY=
```

---

## Data Model (current)
- `profiles` — user profile with `workspace_id`, `subscription_status`, `auto_suppress_negatives` (default `true`)
- `contacts` — unique by `(workspace_id, lower(email))`
- `suppressions` — global; unique by `(workspace_id, lower(email))`; reasons: `unsubscribed | complaint | bounced | manual | role_account | invalid_format`
- `campaigns` — campaign metadata
- `campaign_suppressions` — unique by `(campaign_id, lower(email))`
- `meetings` — tracks bookings for MB/100
- `messages` — raw/send/reply metadata (as needed)

Helper:
```sql
SELECT public.is_suppressed(workspace_id, 'user@example.com', campaign_id);
```

---

## What's Shipped
- CSV Import API + UI with dedupe & suppression guard
- Auto-suppress on negative reply intents
- Reply-intent mapping + hook for calendar insert (meeting)
- RLS policies scoped by workspace_id

---

## Next Slices (Ship Order)
1. **Pre-send Suppression Guard**
   - When launching a send, compute counts of suppressed/invalid recipients
   - Show blocking alert with "Fix list" CTA
   - Only allow send if blocked contacts are excluded

2. **Role-Account Filter on Import**
   - Detect info@, admin@, sales@, support@, no-reply@, etc.
   - Auto-insert into suppressions with reason='role_account'
   - Toggle in settings

3. **Analytics Polish**
   - Trendline for sender health
   - Replies→Meetings funnel

---

## Engineering Rules of the Road
- App Router only under `/app/**`. No `/pages/**`.
- Full file content in PRs; include SQL + RLS if schema changes.
- Add a Run/Verify section with CLI steps + acceptance checks.
- Prefer small, ROI-stacking slices; ship daily.

---

## Run/Verify (local)
```bash
# Install
pnpm i

# Env
cp .env.local.example .env.local  # or create .env.local and fill placeholders

# Dev
pnpm dev

# Check: CSV Import page
# Visit http://localhost:3000/import
# Import a CSV with Email column -> see summary counts.

# Check: Auto-suppress negatives
# POST /api/replies/handle-intent with INTERNAL_API_KEY header and body:
# { "workspaceId":"<uuid>", "email":"optout@example.com", "intent":"unsubscribe" }
# Verify row in public.suppressions.

# (After adding pre-send guard)
# Launch a test send; verify blocked suppressed count + alert.
```

---

## Run/Verify (what to do right now)

```bash
# 1) Add the README
mkdir -p docs
git add README.md
git commit -m "docs: lock SmartSend AI scope (MB/100, wedge, stack, next slices)"

# 2) Paste the System Prompt (above) into Cursor > Project Instructions

# 3) Acceptance check
# - Cursor should echo back the constraints when asked:
#   "What's our North Star and next slice?" → It should say MB/100 and Pre-send guard.
```