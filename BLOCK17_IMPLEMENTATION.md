# Block 17: Retention Levers Implementation

## Overview

Successfully implemented a complete customer retention system with NPS surveys, Churn Guard monitoring, and automated Win-back email campaigns.

## ✅ What's Been Implemented

### 1. Database Schema
- **Migration**: `supabase/migrations/20251101_retention.sql`
  - Created `nps_responses` table for NPS tracking
  - Created `churn_guard_events` audit table for churn monitoring
  - Created `winback_queue` for scheduled win-back emails
  - Created `view_retention_metrics` view for dashboard display
  - Added helper functions: `fn_should_show_nps()`, `fn_submit_nps()`, `fn_classify_nps()`
  - Added proper RLS policies

### 2. NPS System
- **API Route**: `src/app/api/nps/route.ts`
  - GET endpoint to check if NPS should be shown
  - POST endpoint to submit NPS responses
  - Uses RPC functions for data operations

- **Widget**: `src/components/dashboard/NpsWidget.tsx`
  - Floating NPS survey widget
  - 0-10 score selector
  - Optional feedback textarea
  - Auto-shows based on eligibility rules

### 3. Churn Guard System
- **Stripe Webhook Updates**: `src/app/api/stripe/webhook/route.ts`
  - Tracks subscription cancellations
  - Detects churn risk (past_due, incomplete statuses)
  - Automatically schedules win-back sequences
  - Cancels win-back emails if subscription reactivates
  - Records all events in `churn_guard_events` table

### 4. Win-Back Drip Campaign
- **Edge Function**: `supabase/functions/winback-drip/index.ts`
  - Daily cron job to process scheduled win-back emails
  - 3-stage drip sequence: 7, 21, 45 days after cancellation
  - Sends via Resend API
  - Marks emails as sent
  - Records events in churn guard

### 5. Dashboard Integration
- **Retention Summary**: `src/components/dashboard/RetentionSummary.tsx`
  - Displays NPS score and classification
  - Shows promoters, passives, detractors breakdown
  - Shows churn risk indicators
  - Shows win-back email activity
  - Integrated into main dashboard

- **Dashboard Updates**: `src/app/dashboard/page.tsx`
  - Added RetentionSummary component
  - Added NpsWidget component (floating)
  - Retains existing dashboard functionality

## 🚀 Setup Instructions

### 1. Apply Database Migration

```bash
# Run the migration in Supabase SQL Editor
# Or use Supabase CLI:
supabase migration up
```

Or run the SQL directly in Supabase Dashboard → SQL Editor.

### 2. Deploy Edge Function

```bash
# Deploy the winback-drip function
supabase functions deploy winback-drip --no-verify-jwt

# Schedule the function to run daily at 5 PM UTC
supabase functions schedule create winback-daily \
  --cron "0 17 * * *" \
  --endpoint /winback-drip
```

### 3. Configure Environment Variables

Add to your `.env.local`:

```bash
# Resend Configuration (for win-back emails)
RESEND_API_KEY=re_xxx
WINBACK_FROM=team@smartsendhq.com
APP_URL=https://app.smartsendhq.com

# Supabase Configuration (should already exist)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
```

### 4. Verify Stripe Webhook

Ensure your Stripe webhook is configured to listen for:
- `customer.subscription.updated`
- `customer.subscription.deleted`

The webhook handler now includes Churn Guard hooks.

### 5. Test the Flow

1. **Test NPS Widget**:
   - Log into dashboard
   - Wait 30+ days without submitting NPS
   - Widget should appear automatically
   - Submit a response
   - Verify it appears in `nps_responses` table

2. **Test Churn Guard**:
   - Cancel a test subscription via Stripe
   - Check `churn_guard_events` for cancellation event
   - Check `winback_queue` for scheduled emails (7, 21, 45 days)
   - Verify 3 jobs are created

3. **Test Win-Back Drip**:
   - Manually set `scheduled_for` to today in `winback_queue`
   - Trigger the edge function manually or wait for cron
   - Verify email is sent via Resend
   - Check `sent_at` is populated
   - Check `churn_guard_events` for `winback_sent` event

4. **Test Reactivation**:
   - Reactivate a canceled subscription
   - Verify `winback_queue` pending jobs are deleted
   - Check `churn_guard_events` for reactivation

## 📋 Usage Examples

### Check if NPS Should Show

```typescript
// Automatically handled by NpsWidget component
// Or manually:
const response = await fetch(`/api/nps?org_id=${orgId}`);
const { should_show } = await response.json();
```

### Submit NPS Response

```typescript
const response = await fetch('/api/nps', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    org_id: orgId,
    score: 9,
    feedback: 'Love the automation features!'
  })
});
```

### View Retention Metrics

```typescript
// Automatically loaded by RetentionSummary component
// Or manually:
const { data } = await supabase
  .from('view_retention_metrics')
  .select('*')
  .eq('org_id', orgId)
  .single();

console.log(data.nps_avg_score);
console.log(data.churn_risk_count);
console.log(data.winback_sent_count);
```

### Manual Win-Back Queue Insert

```typescript
// Schedule a win-back email for 7 days from now
const { data } = await supabase
  .from('winback_queue')
  .insert({
    org_id: orgId,
    stage: 1, // 1, 2, or 3
    scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  });
```

## 🔒 RLS Policies

The migration automatically sets up:
- Users can view their own NPS responses
- Users can insert their own NPS responses
- Users can view churn guard events for their orgs
- Service role can manage all churn guard data
- Win-back queue is service role only

## 🎯 NPS Classification

- **Promoters**: Score 9-10 (happy customers)
- **Passives**: Score 7-8 (satisfied but unenthusiastic)
- **Detractors**: Score 0-6 (unhappy customers)

**NPS Score** = % Promoters - % Detractors

## 📊 Retention Metrics View

The `view_retention_metrics` view provides:
- Latest NPS score
- Average NPS score
- Promoters/Passives/Detractors counts
- Churn risk event count
- Win-back emails sent count
- Last churn event timestamp

## 🐛 Troubleshooting

**NPS widget not showing?**
- Check user has been active in last 7 days
- Check no NPS response in last 30 days
- Check `fn_should_show_nps()` returns true
- Check console for errors

**Win-back emails not sending?**
- Check `RESEND_API_KEY` is set correctly
- Verify winback-drip function is deployed
- Check cron schedule is active
- Check Supabase Edge Function logs
- Verify `scheduled_for` dates are correct

**Churn Guard events not recording?**
- Verify Stripe webhook is hitting correct endpoint
- Check `org_id` exists for user
- Check `org_members` table has correct relationship
- Review Stripe webhook logs

**Retention metrics empty?**
- Ensure org has activity
- Check NPS responses have been submitted
- Verify `view_retention_metrics` grants

## ✅ Implementation Checklist

- [x] Database migration for NPS, churn guard, winback
- [x] NPS API route (GET and POST)
- [x] NPS widget component
- [x] Churn Guard hooks in Stripe webhook
- [x] Win-back drip Edge Function
- [x] RetentionSummary dashboard component
- [x] Dashboard integration
- [x] RLS policies
- [x] Helper functions
- [ ] Deploy migration to production
- [ ] Deploy Edge Function
- [ ] Configure cron schedule
- [ ] Test end-to-end flow
- [ ] Monitor in production

## 📚 Related Files

- `supabase/migrations/20251101_retention.sql` - Database schema
- `src/app/api/nps/route.ts` - NPS API
- `src/components/dashboard/NpsWidget.tsx` - NPS widget UI
- `src/components/dashboard/RetentionSummary.tsx` - Retention dashboard
- `src/app/api/stripe/webhook/route.ts` - Stripe webhook with Churn Guard
- `supabase/functions/winback-drip/index.ts` - Win-back email function
- `src/app/dashboard/page.tsx` - Dashboard integration

## 📝 Notes

- Win-back emails are staged: 7 days, 21 days, 45 days after cancellation
- NPS widget shows once per 30 days
- Churn Guard tracks all subscription state changes
- Reactivated subscriptions automatically cancel pending win-back emails
- All retention data is tied to org_id for multi-user support

