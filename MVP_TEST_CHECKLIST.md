# SmartSend — End-to-End Test Checklist (MVP)

## 0) Prereqs (env)

Create/verify `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
WHATSAPP_VERIFY_TOKEN=dev-verify-token
```

**Restart dev server after changes.**

## 1) DB sanity (fast asserts)

Run the migration in Supabase SQL Editor:

```bash
# Run the migration file
supabase/migrations/99999999999999_smartsend_mvp_setup.sql
```

This creates the required tables:
- `campaigns`
- `leads` (with unique constraint on campaign_id, email)
- `send_queue`
- `campaign_logs`

Or run this in Supabase SQL Editor:

```sql
-- required tables
select 'leads'::text where exists (select 1 from information_schema.tables where table_name='leads');
select 'send_queue' where exists (select 1 from information_schema.tables where table_name='send_queue');
select 'campaign_logs' where exists (select 1 from information_schema.tables where table_name='campaign_logs');

-- unique index for upsert hygiene
create unique index if not exists leads_campaign_email_unique on public.leads (campaign_id, email);
```

## 2) Seed a campaign + a couple test leads

```sql
-- campaign
insert into campaigns (id, name)
values ('11111111-1111-1111-1111-111111111111', 'MVP Test') 
on conflict (id) do nothing;

-- optional seed leads (or import via CSV in step 3)
insert into leads (id, campaign_id, email, status)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'jane@example.com', 'new'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'john@example.com', 'failed');
```

## 3) CSV Importer (UI → DB)

Go to `/dashboard/import` or `/leads/import`.

Enter `11111111-1111-1111-1111-111111111111` as Campaign ID.

Upload a CSV (map email, optionally map first_name, etc.).

Click **Import Leads** → expect success toast + rows in leads.

**✅ Pass if:** leads count increases and duplicates are upserted (no dup per campaign/email).

## 4) Dashboard Filters + Pagination

Go to `/dashboard/leads`.

Change Status, Per Page, Campaign ID, Search → Apply.

Use Prev/Next and ensure counts update.

Click quick chip Status: `failed`.

**✅ Pass if:** results reflect querystring; pagination shows correct page/total.

## 5) Bulk Retry & One-Click Retry

From `/dashboard/leads?status=failed`:

**Retry All Failed (This Page)** → toast success; new rows appear in send_queue with status="retrying".

Select a subset → **Retry Selected** → same expectation.

**✅ Pass if:** send_queue gets inserts with correct lead_id/campaign_id and status='retrying'.

## 6) Reply Detection Webhook (AI)

Call your Supabase Edge Function `replyDetection` with a realistic payload:

```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/functions/v1/replyDetection" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "provider":"generic",
    "message_id":"t_123",
    "subject":"Re: Your offer",
    "body_text":"Hey—this looks good. Let'\''s talk tomorrow.",
    "from_email":"prospect@example.com"
  }'
```

Then check:
- `leads.status` for that email becomes `replied`
- `campaign_logs` gets an entry (if you log one in your function)

**✅ Pass if:** lead flips to replied and a log entry is recorded.

## 7) Visual & UX polish

- Toasts appear/disappear (success/error/info).
- Loading spinners show for Apply, Import, and both Retry buttons.
- Ghost/outline buttons render as expected.

**✅ Pass if:** no blocking alerts; UI stays responsive.

## 8) Minimal RLS sanity (server role writes)

If RLS is ON for leads/send_queue, ensure your server actions/edge functions use service-role keys. Keep user-facing reads via anon where appropriate. A safe baseline policy (adapt to your auth model):

```sql
-- Example read policy (adjust to your auth)
create policy if not exists leads_read on leads
for select using (true);

-- Writes are via service role only (no policy needed), or add a guarded policy tied to your app's auth if desired.
```

## 9) Go/No-Go criteria

**✅ CSV import succeeds (duplicates handled).**
**✅ Filters/pagination accurate.**
**✅ Retry flows create queue rows.**
**✅ Reply webhook flips status to replied.**
**✅ No console errors; toasts + spinners working.**

If any fail, note the exact step + console/network error and we'll patch immediately.

---

# OpsGrid — WhatsApp → CRM (First MVP Slice)

Goal: Accept WhatsApp webhook → normalize → upsert contacts and store inbound messages. Works with WhatsApp Cloud API (or any provider that posts a similar payload).

## 1) DB (OpsGrid) minimal tables

Run the migration in Supabase SQL Editor:

```bash
# Run the migration file
supabase/migrations/99999999999998_opsgrid_whatsapp.sql
```

This creates:
- `contacts` table with phone uniqueness
- `messages` table for inbound/outbound tracking

Or run manually:

```sql
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  name text,
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  direction text check (direction in ('inbound','outbound')),
  provider text,
  payload jsonb,
  text text,
  ts timestamptz default now()
);
```

## 2) Route: app/api/whatsapp/webhook/route.ts

Already created! Handles GET (verification challenge) and POST (message events).

Set `WHATSAPP_VERIFY_TOKEN` in your env. In Meta → Webhooks, paste your verify token and your public URL to `/api/whatsapp/webhook`.

## 3) Quick local test (POST)

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"from":"+12065550123","text":"Hey OpsGrid!"}'
```

**✅ Pass if:** a contact with that phone is created/updated and an inbound message row is inserted.

## 4) Next steps after webhook

Add outbound sender (POST to WhatsApp Cloud API with your token).

Create a pipeline rule: on first inbound from unknown number → create a CRM record/task.

Build a simple inbox UI (`/ops/inbox`) listing recent contacts + last message.
