# Connected Accounts Tab

## Overview

Expose a `Settings → Integrations → Connected Accounts` page that lists every OAuth mailbox stored in `public.mail_accounts`. The tab helps operators understand which sender addresses are live, quota posture, and when action is required.

## UX Requirements

- Show rows for each connected email sorted by most recent `created_at`.
- Display provider badge (Gmail or Outlook), email address, optional label, and status.
- Include a usage bar showing `quota_used / quota_daily` with numeric tooltip.
- Surface token expiry (`expires_at`) and indicate if refresh is within 24 hours.
- Provide primary actions:
  - `Reconnect` → hit provider start route (`/api/auth/gmail/start`, `/api/auth/outlook/start`).
  - `Pause / Resume` → toggles `status` between `active` and `paused`.
  - `Remove` (Optional) → soft delete / mark `status='revoked'`.
- Add top-level buttons:
  - `+ Connect Gmail` → navigate to `/api/auth/gmail/start`.
  - `+ Connect Outlook` → navigate to `/api/auth/outlook/start`.
- Gracefully handle empty states with CTA to connect the first account.

## Data Fetching

- Use a server component loader (e.g. `createSupabaseServer`) to query `mail_accounts` filtered by the viewer's `account_id`.
- Map provider icons via existing Lucide or custom SVG set.
- Expose quota progress as `Math.min(quota_used / quota_daily, 1)`.
- When pause/resume succeeds, optimistically update UI; show toast on error.

## API Hooks

- `POST /api/mail/accounts/pause` → body `{ id, status }`.
- `DELETE /api/mail/accounts/:id` → optional removal.
- Ensure RLS policy allows account admins to update their own rows only.

## QA Checklist

1. **OAuth Onboarding**
   - Connect Gmail → new row appears with correct provider icon.
   - Connect Outlook → new row appears.
2. **Sending Flow**
   - Trigger send-worker queue item → provider adapter returns Gmail `provider_id`.
   - Observe `quota_used` increment after each send.
3. **Quota Reset**
   - Manually set `last_reset` to yesterday and run `select public.reset_mail_quotas();` → row resets to `quota_used=0`.
4. **Token Refresh**
   - Force 401 from Gmail/Outlook (short-lived token) → `provider-send` refreshes and retries.
5. **Pause Enforcement**
   - Mark account `status='paused'` → send-worker receives `account_paused`.
6. **Error Surfacing**
   - Delete refresh token → refresh call raises `token_refresh_failed` and surfaces error in UI.
7. **Security**
   - Confirm only account members can read/update their rows (RLS).
8. **Regression**
   - Verify legacy SMTP/Resend flows still operate when `mail_accounts` empty.



