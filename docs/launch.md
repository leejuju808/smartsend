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

