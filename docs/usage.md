# Usage & Quota

- **Table:** `public.usage_events` (user_id, kind, created_at)
- **Free daily quota:** `FREE_DAILY_QUOTA` (server) / `NEXT_PUBLIC_FREE_DAILY_QUOTA` (display)
- **Server helper:** `requireQuota(kind)` and `recordUsage(userId, kind)`
- **API:** `POST /api/usage/consume` with `{ kind }` → `{ remaining, quota }` or `429 quota_exceeded`

Pro users are unlimited; free users are limited per day. Adjust the `kind` label to track different features independently.
