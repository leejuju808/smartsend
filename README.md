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