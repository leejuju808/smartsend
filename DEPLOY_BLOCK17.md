# Block 17 Deployment Guide

## Quick Deploy Checklist

### 1. Database Migration ✅
```bash
# Option A: Via Supabase Dashboard
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy contents of supabase/migrations/20251101_retention.sql
# 3. Run the SQL

# Option B: Via CLI (recommended)
cd /Users/juju/smartsend-ai
supabase db push

# Or if using migrations folder:
supabase migration up
```

### 2. Deploy Edge Function ✅
```bash
# Deploy winback-drip function
cd /Users/juju/smartsend-ai
supabase functions deploy winback-drip --no-verify-jwt

# Verify deployment
supabase functions list
```

### 3. Schedule Cron Job ✅
```bash
# Schedule daily winback-drip execution at 5 PM UTC
supabase functions schedule create winback-daily \
  --cron "0 17 * * *" \
  --endpoint /functions/v1/winback-drip

# Verify schedule
supabase functions schedule list
```

### 4. Environment Variables ✅
Add to your production environment (Vercel/Heroku/etc.):

```bash
# Resend (for win-back emails)
RESEND_API_KEY=re_xxx

# Win-back email sender
WINBACK_FROM=team@smartsendhq.com

# App URL for CTA links
APP_URL=https://app.smartsendhq.com

# Already should exist:
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 5. Verify Stripe Webhook ✅
Ensure webhook endpoint is configured in Stripe Dashboard:
- URL: `https://yourdomain.com/api/stripe/webhook`
- Events: `customer.subscription.updated`, `customer.subscription.deleted`

### 6. Test End-to-End ✅

#### Test NPS System:
```bash
# 1. Create a test org (or use existing)
# 2. Wait 30+ days OR manually insert old activity
# 3. Log into dashboard
# 4. NPS widget should appear
# 5. Submit a response
# 6. Check database: SELECT * FROM nps_responses ORDER BY created_at DESC LIMIT 1;
```

#### Test Churn Guard:
```bash
# 1. Cancel a test Stripe subscription
# 2. Check database: SELECT * FROM churn_guard_events ORDER BY created_at DESC LIMIT 5;
# 3. Should see 'subscription_canceled' event
# 4. Check: SELECT * FROM winback_queue ORDER BY scheduled_for;
# 5. Should see 3 jobs (7, 21, 45 days from now)
```

#### Test Win-Back Drip:
```bash
# 1. Manually update winback_queue:
UPDATE winback_queue 
SET scheduled_for = CURRENT_DATE 
WHERE id = '<some-id>' AND sent_at IS NULL;

# 2. Trigger function manually:
supabase functions invoke winback-drip

# 3. Check email was sent (Resend dashboard)
# 4. Check database: SELECT * FROM winback_queue WHERE sent_at IS NOT NULL;
# 5. Check: SELECT * FROM churn_guard_events WHERE event_type = 'winback_sent';
```

#### Test Reactivation:
```bash
# 1. Reactivate a canceled subscription in Stripe
# 2. Check winback_queue: Should have no pending jobs
# 3. Check churn_guard_events: Should see 'subscription_updated' event
```

## Verification Commands

### Check Database Tables:
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('nps_responses', 'churn_guard_events', 'winback_queue');

-- Verify views exist
SELECT viewname FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'view_retention_metrics';

-- Verify functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('fn_should_show_nps', 'fn_submit_nps', 'fn_classify_nps');
```

### Check RLS Policies:
```sql
-- Verify RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('nps_responses', 'churn_guard_events', 'winback_queue');

-- Verify policies exist
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('nps_responses', 'churn_guard_events');
```

### Check Edge Functions:
```bash
# List all functions
supabase functions list

# Check function logs
supabase functions logs winback-drip

# Test function locally
supabase functions serve winback-drip
curl -X POST http://localhost:54321/functions/v1/winback-drip \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Check Cron Schedule:
```bash
# List schedules
supabase functions schedule list

# Check cron syntax is valid
# Should see: winback-daily | 0 17 * * * | /functions/v1/winback-drip
```

## Monitoring

### Dashboard Metrics:
Monitor these in your dashboard:
- NPS score trends over time
- Churn risk indicators
- Win-back email send rate
- Win-back email conversion rate

### Database Monitoring:
```sql
-- Daily NPS submissions
SELECT DATE(created_at), COUNT(*) 
FROM nps_responses 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC;

-- Churn events by type
SELECT event_type, COUNT(*) 
FROM churn_guard_events 
GROUP BY event_type;

-- Win-back delivery rate
SELECT 
  COUNT(*) as total_scheduled,
  COUNT(sent_at) as sent,
  COUNT(*) - COUNT(sent_at) as pending
FROM winback_queue;
```

### Function Logs:
```bash
# Check for errors in winback-drip
supabase functions logs winback-drip --tail

# Look for patterns:
# - "Failed to send email" (Resend issues)
# - "Org not found" (data integrity)
# - "Email not found" (user data issues)
```

## Rollback Plan

If you need to rollback:

```sql
-- Drop the new tables (careful!)
DROP TABLE IF EXISTS public.nps_responses CASCADE;
DROP TABLE IF EXISTS public.churn_guard_events CASCADE;
DROP TABLE IF EXISTS public.winback_queue CASCADE;
DROP VIEW IF EXISTS public.view_retention_metrics CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS public.fn_should_show_nps(uuid);
DROP FUNCTION IF EXISTS public.fn_submit_nps(uuid, int, text);
DROP FUNCTION IF EXISTS public.fn_classify_nps(int);

-- Revert webhook changes
# Manually revert src/app/api/stripe/webhook/route.ts to previous version
```

## Success Criteria

✅ All migrations run without errors  
✅ Edge function deploys successfully  
✅ Cron schedule is active  
✅ NPS widget appears for eligible users  
✅ Retention metrics display correctly  
✅ Churn Guard records subscription events  
✅ Win-back emails send as scheduled  
✅ Reactivation cancels pending win-back emails  

## Support

If issues arise:
1. Check Supabase logs: Dashboard → Logs
2. Check Edge Function logs: `supabase functions logs winback-drip`
3. Check Stripe webhook logs: Stripe Dashboard → Developers → Webhooks
4. Review BLOCK17_IMPLEMENTATION.md for troubleshooting

## Next Steps

After deployment:
1. Monitor for 24-48 hours
2. Review first NPS responses
3. Check win-back email delivery rates
4. Adjust cron schedule if needed
5. Iterate on email templates based on results

