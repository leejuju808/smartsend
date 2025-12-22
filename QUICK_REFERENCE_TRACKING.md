# Email Tracking - Quick Reference

## What Was Implemented

A complete email tracking system for leads that captures:
- ✅ Email opens (via invisible tracking pixel)
- ✅ Link clicks (via URL redirect tracking)
- ✅ Opens/Clicks counts displayed in Leads table

## Quick Setup (3 Steps)

### 1. Run Migration
```sql
-- Run in Supabase SQL Editor:
-- See: supabase/migrations/20251030_email_tracking_events.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Set Environment Variable
```bash
# In Supabase Dashboard → Functions → Secrets, add:
APP_BASE_URL=https://your-app-domain.com

# Or via CLI:
supabase secrets set APP_BASE_URL=https://your-app-domain.com
```

### 3. Deploy Worker
```bash
supabase functions deploy sendWorker
```

## Files Changed

**New Files:**
- `supabase/migrations/20251030_email_tracking_events.sql` - DB schema
- `src/app/api/tracking/o/[token]/route.ts` - Open pixel endpoint
- `src/app/api/tracking/c/route.ts` - Click redirect endpoint  
- `src/app/api/leads/engagement/route.ts` - Engagement API
- `EMAIL_TRACKING_SETUP.md` - Full documentation

**Modified Files:**
- `supabase/functions/sendWorker/index.ts` - Added tracking injection
- `src/components/LeadsTable.tsx` - Added opens/clicks columns

## How It Works (Simple)

1. **Send Email**: Worker creates token, wraps links, injects pixel
2. **Email Opened**: Pixel loads → records open event
3. **Link Clicked**: Redirect through tracker → records click event
4. **Display**: Leads table shows counts via `/api/leads/engagement`

## API Endpoints

- `GET /api/tracking/o/{token}` - Tracking pixel (returns 1x1 PNG)
- `GET /api/tracking/c?t={token}&u={url}` - Click redirect
- `POST /api/leads/engagement` - Fetch engagement counts

Body: `{ "lead_ids": ["uuid1", "uuid2", ...] }`

Returns: `[{ "lead_id": "uuid1", "opens": 5, "clicks": 2 }, ...]`

## Database Tables

**lead_tracking_tokens** - One token per (workspace, campaign, lead)
**lead_email_events** - All open/click events

```sql
-- Quick check: See recent events
SELECT * FROM lead_email_events ORDER BY created_at DESC LIMIT 10;

-- Check engagement for a lead
SELECT * FROM v_lead_engagement WHERE lead_id = 'your-lead-id';
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No opens/clicks showing | Check `APP_BASE_URL` is set correctly |
| 404 on pixel load | Verify endpoint exists at `/api/tracking/o/[token]` |
| Events not recording | Check migration ran successfully |
| Wrong counts | Clear browser cache, check view is up to date |

## Next Steps (Optional)

- Add delivered/bounced tracking
- Track individual links separately
- Add time-based analytics (first/last open times)
- Geographic data from IP addresses
- Device/browser breakdown from user agent

See `EMAIL_TRACKING_SETUP.md` for full details.

