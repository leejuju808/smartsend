## SmartSend Launch Checklist

### Tracking and email threading

Add the following environment variables:

```
TRACKING_SECRET=replace_with_long_random_string
MAIL_MESSAGE_ID_DOMAIN=yourdomain.com
```

Ensure `NEXT_PUBLIC_SITE_URL` is set to your public base URL (e.g., `https://app.example.com`).

### LIVE environment variables
- **Domain**: `NEXT_PUBLIC_APP_URL` (e.g., `https://app.smartsend.ai`)
- **Supabase**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server only)
- **Stripe**:
  - `NEXT_PUBLIC_STRIPE_PRICE_ID`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- **Email** (optional for launch):
  - `RESEND_API_KEY` or provider-specific keys if used

### Deploy steps (Vercel)
1. Push `main` to GitHub.
2. In Vercel project settings:
   - Add all env vars above in Production.
   - Set `Node.js` runtime to 18+.
   - Set Build Command: `next build` and Output: `.vercel/output` (defaults ok).
3. Connect custom domain and set to `NEXT_PUBLIC_APP_URL`.
4. Redeploy Production.

### Stripe + Supabase setup
1. In Stripe, create the recurring price and set `NEXT_PUBLIC_STRIPE_PRICE_ID`.
2. Create webhook endpoint pointing to `{APP_URL}/api/webhook` with events: `checkout.session.completed`, `customer.subscription.updated`, `invoice.paid`, `invoice.payment_failed`.
3. Paste the `STRIPE_WEBHOOK_SECRET` in Vercel env.
4. In Supabase, run migrations and confirm tables: `profiles`, `users`, `usage_events`, `email_sends`, `leads`, `sequences`, `mailboxes`.

### Smoke test (Production)
1. Signup flow: visit `/signup`, create account, verify you land in dashboard.
2. Upgrade: go to `/dashboard/billing`, complete Stripe checkout, return to app; verify Pro status.
3. Connect Gmail: `/settings/mailbox` → Connect Gmail OAuth or save SMTP.
4. Leads import: `/leads/import` → upload `public/leads_template.csv` and confirm rows appear.
5. Launch sequence: create a sequence, queue 1-2 sends, verify `email_sends` shows `queued`/`sent`.
6. Unsubscribe: open an email preview link, hit `/unsubscribe`, verify lead is unsubscribed.

### Post-launch tasks
- **DM 10 people**: early users and friendly founders with invite link.
- **Post screenshot**: share dashboard metrics on X with signup link and code `Founders50`.
- **Pin posts**: pin on X and LinkedIn with CTA and link.
- **Monitor**: watch error logs (Sentry/console), Stripe events, and Supabase logs for the first 24h.

## Launch & Dogfood Playbook

### 1) First dogfood campaign (30 min)
- Prepare a list of ~20 indie founders/agency leads (CSV or manual).
- Sequence (3 steps):
  - Hook: "Launch a campaign in <10min, no bloat."
  - Demo link and/or Calendly invite.
  - Reminder in 3–5 days.
- Connect mailbox (SMTP/Gmail) if not already.
- Import leads at `/leads/import`.
- Queue sends and run sender (`POST /api/sender/run`).
- Track metrics in dashboard; take a screenshot.

### 2) Public launch (15 min)
- Post a screenshot: "First 50 emails sent 🚀 with SmartSend. Now live → [link] (Founders50 = 50% off)."
- Pin on X and LinkedIn.
- DM 10 relevant prospects same day.

### 3) Demo campaign seeder
- From dashboard, click "Launch Demo Campaign" to seed example leads and instant results for new users.
- Verify usage counters increase and sequence/sends appear in Supabase.

## SmartSend Launch Playbook

### LIVE environment variables (Vercel)

- **Core (frontend/server)**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Server-only**
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `OPENAI_API_KEY`
  - `RESEND_API_KEY` or `SMTP_URL` (if using SMTP)
- **Usage/Quota**
  - `FREE_DAILY_LIMIT` (e.g., 50)
  - `PRO_DAILY_LIMIT` (e.g., 500)
  - Optional per-kind: `FREE_QUOTA_EMAILS`, `FREE_QUOTA_DEMO`
- **App URLs**
  - `NEXT_PUBLIC_APP_URL` (canonical app domain)
  - `NEXT_PUBLIC_WEB_URL` (marketing site, if separate)

Double-check all secrets exist in Vercel → Settings → Environment Variables for Production and Preview. Redeploy after changes.

### Vercel deploy steps → prod domain

1. **Connect repo** in Vercel (if not already).
2. **Set env vars** in Project → Settings → Environment Variables (Production + Preview).
3. **Add domains** in Project → Settings → Domains
   - Primary: `app.yourdomain.com` (or desired prod domain)
   - Optionally `yourdomain.com` → marketing
4. **Link Supabase** project (ensure RLS policies are as in `supabase/migrations/`).
5. **Stripe**: set webhook to `https://<prod-domain>/api/webhook`.
6. **OpenAI** key validated with a quick test via `/api/generate-emails` (200 OK expected).
7. **Deploy** main branch → Promote to Production.

### Smoke test flow (end-to-end)

1. Signup with a brand-new email in Production
2. Upgrade to Pro using a real card (or test card in test env)
3. Connect Gmail/SMTP (send test email)
4. Import CSV with 5 dummy leads (use `public/leads_template.csv`)
5. Launch a 3‑step sequence
6. Verify:
   - `users.subscription_status` = `pro`
   - Usage counters increment (`/api/usage/status?kind=emails`)
   - Unsubscribe link in email works → `unsubscribed = true` for that lead
7. Take a dashboard screenshot with visible metrics

If any step fails: capture console/network logs, note server response codes, and file an issue.

### Post‑launch growth actions (Day 0)

- **Tweet / X**: Screenshot + "First 50 emails sent 🚀 with SmartSend. Now live → <link> (Founders50 = 50% off)."
- **LinkedIn**: Same post adapted; tag early adopters if appropriate.
- **DM 10 prospects**: short note + link + coupon.
- **Referrals**: DM friendly founders/agency owners with invite and coupon.
- **Measure**: track clicks/signups from these posts (UTM tags).

### Quick operator prompts (for Cursor)

- Generate this file: "Generate docs/launch.md with env checklist, Vercel deploy steps, smoke test flow, and first growth actions."
- Seed demo flow: "Add Launch Demo Campaign button to dashboard. Seeds demo leads + sequence into Supabase and updates dashboard metrics to show fake engagement."

