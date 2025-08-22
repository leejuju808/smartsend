## SmartSend Deployment Guide (Prod)

### LIVE environment variables
- **STRIPE_SECRET_KEY**: `sk_live_...`
- **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**: `pk_live_...`
- **NEXT_PUBLIC_STRIPE_PRICE_ID**: `price_...` (live price)
- **STRIPE_WEBHOOK_SECRET**: `whsec_...` (from Stripe dashboard → Webhooks)
- **SUPABASE_SERVICE_ROLE_KEY**: Service role key (do not expose client-side)
- **NEXT_PUBLIC_SUPABASE_URL**: Supabase project URL
- **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Supabase anon key (for client)
- **NEXT_PUBLIC_APP_URL**: Public app URL, e.g., `https://app.example.com`
- Optional:
  - **ABANDONED_PROMO_CODE**: A promo code to include in abandoned checkout emails
  - **RESEND_API_KEY**, **RESEND_FROM**: For transactional emails

### GitHub → Vercel deployment steps
1. Push `main` to GitHub.
2. In Vercel, import the GitHub repo.
3. In Vercel → Settings → Environment Variables, add the LIVE variables above to the Production environment.
4. Trigger a production deploy (push or redeploy).
5. In Vercel → Domains, add your production domain and assign it to Production.

### DNS configuration
- Create an `A` or `CNAME` record per Vercel’s instructions for your domain.
- If using subdomain (e.g., `app.example.com`), create the CNAME to the Vercel-provided target.
- Optionally set `www` to redirect to apex or app subdomain in Vercel.

### Stripe webhook
- In Stripe Dashboard → Developers → Webhooks, add an endpoint pointing to `https://YOUR_DOMAIN/api/webhook`.
- Select events:
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copy the signing secret and set `STRIPE_WEBHOOK_SECRET` in Vercel (Production).

### Smoke test checklist (Prod)
1) Signup
   - Create a new account on the prod domain.
   - Expected: Row in `profiles` (and/or `users`) created.

2) Upgrade
   - Click “Go Pro” → Stripe Checkout, pay with a real card.
   - Expected: Webhook processes; `profiles.subscription_status = 'pro'`.

3) Connect mailbox
   - Use Gmail OAuth or SMTP and send a test email.
   - Expected: Test mail delivered and reported as success.

4) Import leads
   - Upload `leads_template.csv`.
   - Expected: Summary shows `imported=__`, `duplicates=__`, `skipped=__`.

5) Launch a 3-step sequence
   - Create and start a 3-step campaign.
   - Expected: At least 3 emails sent; counters increment in daily send metrics.

6) Free plan limit (optional)
   - As a free user, send until you hit 50/day cap.
   - Expected: Upgrade modal shown.

7) Unsubscribe test
   - Click `%UNSUB%` link in an email.
   - Expected: Contact unsubscribed; no future sends.

### Health & logs
- Visit `/api/health` → expect `{ ok: true }`.
- Vercel logs: verify webhook processing and mail send logs.
- Supabase: ensure `processed_events` (or equivalent) contains Stripe event IDs.

## SmartSend Deployment Checklist (Vercel)

### 1) Prepare LIVE environment variables (Vercel → Project → Settings → Environment Variables)

Required
- NEXT_PUBLIC_APP_URL: https://smartsend.ai
- NEXT_PUBLIC_SUPABASE_URL: https://<your-supabase-project>.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY: <supabase_anon_key>
- SUPABASE_SERVICE_ROLE_KEY: <supabase_service_role_key>

- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: pk_live_...
- STRIPE_SECRET_KEY: sk_live_...
- STRIPE_WEBHOOK_SECRET: whsec_...
- NEXT_PUBLIC_STRIPE_PRICE_ID: price_live_... (default monthly price)

Email + AI
- OPENAI_API_KEY: <openai_key>
- RESEND_API_KEY: <resend_key> (if using Resend)
- RESEND_FROM: billing@smartsend.ai

Plan limits and pricing
- NEXT_PUBLIC_PRICE_DEFAULT_TERM: monthly | annual (default: monthly)
- NEXT_PUBLIC_PRICE_VARIANT: standard|founders (optional A/B)
- NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL: price_live_... (if annual supported)
- STRIPE_PRICE_PRO_STANDARD: price_live_... (optional)
- STRIPE_PRICE_PRO_FOUNDERS: price_live_... (optional)
- STRIPE_PRICE_PRO_ANNUAL: price_live_... (optional)
- STRIPE_PRICE_PRO_ANNUAL_STANDARD: price_live_... (optional)
- STRIPE_PRICE_PRO_ANNUAL_FOUNDERS: price_live_... (optional)
- FREE_DAILY_LIMIT: 50 (default)
- PRO_DAILY_LIMIT: 500 (default)
- NEXT_PUBLIC_FREEWALL_KIND: demo (default)
- ORG_FREE_SEAT_LIMIT: 1 (optional)
- ORG_PRO_SEAT_LIMIT: 5 (optional)
- PRO_SEAT_LIMIT: 5 (optional legacy)
- FREE_SEAT_LIMIT: 1 (optional legacy)

Stripe experiments (optional)
- SAVE_PROMOTION_CODE: <code>
- SAVE_COUPON_ID: <coupon_id>
- STRIPE_RESCUE_COUPON_ID: <coupon_id>
- STRIPE_RESCUE_COUPON_ID_A: <coupon_id> (optional)
- STRIPE_RESCUE_COUPON_ID_B: <coupon_id> (optional)
- STRIPE_RESCUE_COUPON_ID_C: <coupon_id> (optional)

System & ops
- LOG_LEVEL: info
- CRON_SECRET: <random> (for /api/cron/* routes)
- USAGE_ALERT_THRESHOLD: 1 (optional)
- USAGE_ALERT_COOLDOWN_DAYS: 3 (optional)
- SENTRY_DSN: https://... (optional)
- SENTRY_ENVIRONMENT: production (optional)
- SENTRY_TRACES_SAMPLE_RATE: 0.05 (optional)
- ROADMAP_URL: https://smartsend.ai/roadmap (optional)

Marketing
- ABANDONED_PROMO_CODE: Founders50 (optional – abandon flows)
- CANCEL_INTERCEPT_ENABLED: 1 (optional)

Notes:
- Ensure all values are set in both Production and Preview if needed. For local, mirror in .env.local.
- After adding/updating envs, trigger a redeploy for them to take effect.

### 2) GitHub → Vercel deployment steps

1. Push main branch to GitHub.
2. In Vercel, “Add New Project” → Import GitHub repo.
3. Framework Preset: Next.js; Build Command: default; Output: .vercel/output (default).
4. Add all environment variables (above) in Production.
5. Deploy. Confirm build succeeds and health endpoint returns OK (see step 4).

### 3) DNS / Custom domain (smartsend.ai)

- In Vercel → Project → Settings → Domains → Add `smartsend.ai`.
- If your DNS host supports ALIAS/ANAME for apex:
  - Create ALIAS/ANAME for @ → cname.vercel-dns.com
- If apex ALIAS/ANAME not supported:
  - Use Vercel’s recommended A records (provided in the domain setup UI) for @
- For the `www` subdomain:
  - Create CNAME for `www` → cname.vercel-dns.com
- Email deliverability (Resend or your ESP):
  - Add SPF: TXT @ → v=spf1 include:shops.shopify.com include:amazonses.com include:_spf.resend.com ~all (adjust to your stack)
  - Add DKIM (as provided by Resend) – two CNAME records.
  - Add DMARC: TXT _dmarc → v=DMARC1; p=none; rua=mailto:dmarc@smartsend.ai

### 4) Stripe configuration

- Products/Prices
  - Create Product “SmartSend Pro”.
  - Create recurring Price(s):
    - Monthly → copy `price_live_...` to NEXT_PUBLIC_STRIPE_PRICE_ID
    - Annual (optional) → copy to NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
- Webhooks
  - Endpoint: https://smartsend.ai/api/webhook
  - Events: checkout.session.completed, checkout.session.expired, invoice.payment_failed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
  - Copy the “Signing secret” to STRIPE_WEBHOOK_SECRET
- Promotion Code
  - Create Coupon (50% off first month) and a Promotion Code `Founders50`

### 5) Supabase configuration

- Run migrations in `supabase/migrations` (via SQL editor or CLI) to ensure required tables exist.
- Set Service Role key in Vercel (SUPABASE_SERVICE_ROLE_KEY) – server-only.
- In Auth → Settings, add your production domain to Redirect URLs.

### 6) Post-deploy health & smoke tests

Health check
- GET `https://smartsend.ai/api/health` → expect `{ ok: true }`

Full smoke test (15–30 min)
1) Signup → Pay → Connect Mail → Import CSV → Send sequence → Unsubscribe
   - Signup: `/signup` → complete login → land in `/dashboard`.
   - Upgrade: `/dashboard/billing` → start checkout → pay → redirected with `status=success`.
   - Stripe: Subscription Active; webhook delivered to `/api/webhook`.
   - Mail: Connect Gmail/SMTP and send a test from `/troubleshoot`.
   - CSV: Import 5 test leads using `public/leads_template.csv`.
   - Sequence: Create and start a 3-step sequence.
   - Unsubscribe: POST `https://smartsend.ai/api/unsubscribe` with `{ "email": "lead@example.com", "ownerEmail": "you@smartsend.ai" }` and verify DB updated.
2) Metrics increment
   - `/api/usage/status?kind=emails` shows used > 0 today.
   - Supabase `usage_events` rows added.
3) Screenshot
   - Capture usage card and campaign stats.

### 7) Rollback plan

- If deployment breaks, roll back in Vercel to the previous successful deployment.
- Remove or rotate any sensitive envs if compromised.

### 8) Dogfood SmartSend (internal)

- Create a new campaign targeting indie founders/agency leads (use your inbox).
- Import your CSV from `public/leads_template.csv`; verify success toast and dedupe.
- Use a 3-step sequence: “Built a no-bloat outbound tool… want early access?”
- Send ~10 emails on free plan to trigger the proactive upgrade modal.
- Submit feedback via the bottom-right widget; confirm row in `feedback` table.

