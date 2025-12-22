# Block 18: Deliverability Engine Implementation

## Overview

Complete deliverability engine implementation with warm-up, throttling, bounce classification, and hygiene. This system protects your sender reputation by enforcing pacing, suppressing hard bounces, and managing warm-up states.

## ✅ What's Been Implemented

### 1. Database Schema (`supabase/migrations/20251101_deliverability.sql`)

**Tables Created:**
- `domain_sending_rules` - Per-domain throttling (daily/hourly caps, min gap)
- `warmup_state` - Warm-up state per sending account (daily caps, day index, pause)
- `bounce_events` - NDR/DSN tracking and classification
- `suppression_list` - Extended with `reason` column if missing
- `deliverability_reputation` - Rolling reputation metrics per account

**Views Created:**
- `view_deliverability_overview` - 7-day metrics for dashboard

**RLS Policies:**
- All tables secured with workspace-based RLS
- Service role has full access for workers

### 2. Helper Functions (`supabase/migrations/20251101_deliverability_helpers.sql`)

- `fn_usage_count_for_account()` - Count sends for an account (hour/day)
- `fn_warmup_advance()` - Daily warm-up advancement (call via cron)
- `should_send()` - Main throttle gate (suppression + warm-up + domain rules)

### 3. Edge Function (`supabase/functions/bounce-classifier/index.ts`)

Bounce classifier that:
- Parses NDR/DSN messages
- Classifies as hard/soft/transient
- Auto-suppresses hard bounces
- Records bounce events for analytics

### 4. TypeScript Libraries

**`src/lib/deliverability/shouldSend.ts`**
- `shouldSend()` - Client wrapper for throttle gate
- `isSuppressed()` - Quick suppression check

**`src/lib/hygiene.ts`**
- `looksLikeRoleAccount()` - Detect role accounts during CSV import
- `isValidEmailFormat()` - Email validation

### 5. UI Components

**`src/components/deliverability/DeliverabilityOverview.tsx`**
- Dashboard card showing 7-day metrics (sent, open rate, reputation)

**`src/app/settings/deliverability/page.tsx`**
- Warm-up management UI
- Pause/resume warm-up states
- View bounce events and suppression info

### 6. API Routes

**`src/app/api/warmup/toggle/route.ts`**
- POST endpoint to pause/resume warm-up

### 7. Worker Integration

**`src/lib/scheduler/processQueue.ts`** (updated)
- Integrated `shouldSend()` gate before each send
- Automatically skips suppressed/throttled emails

## 🚀 Setup Instructions

### 1. Apply Database Migrations

Run both migrations in Supabase SQL Editor:

```bash
# Migration 1: Core tables and views
supabase/migrations/20251101_deliverability.sql

# Migration 2: Helper functions
supabase/migrations/20251101_deliverability_helpers.sql
```

Or via CLI:
```bash
supabase migration up
```

### 2. Deploy Edge Function

```bash
supabase functions deploy bounce-classifier --no-verify-jwt
```

Set environment variables in Supabase Dashboard:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 3. Set Up Cron for Warm-up Advancement

In Supabase Dashboard → Database → Functions → pg_cron:

```sql
-- Run daily at midnight UTC to advance warm-up states
SELECT cron.schedule(
  'warmup-advance',
  '0 0 * * *', -- Daily at midnight
  $$
  SELECT public.fn_warmup_advance();
  $$
);
```

### 4. Integrate Bounce Classifier

Call the bounce classifier when detecting auto-replies/NDRs:

```typescript
// Example: In your reply detection webhook
const response = await fetch(`${SUPABASE_URL}/functions/v1/bounce-classifier`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    workspace_id: workspaceId,
    recipient_email: recipientEmail,
    subject: emailSubject,
    body: emailBody,
    from_email: fromEmail,
    message_id: messageId,
  }),
});
```

### 5. Add Dashboard Card

Add to your dashboard page:

```tsx
import { DeliverabilityOverview } from '@/components/deliverability/DeliverabilityOverview';

// In your dashboard component:
<DeliverabilityOverview />
```

### 6. Add Settings Link

Add to your settings navigation:

```tsx
<Link href="/settings/deliverability">
  Deliverability
</Link>
```

## 📋 Usage Examples

### Check if Email Should Send

```typescript
import { shouldSend } from '@/lib/deliverability/shouldSend';

const gate = await shouldSend(workspaceId, accountEmail, recipientEmail);
if (!gate.allowed) {
  console.log('Blocked:', gate.reason, gate.details);
  // Skip sending
}
```

### Detect Role Accounts During Import

```typescript
import { looksLikeRoleAccount } from '@/lib/hygiene';

if (looksLikeRoleAccount(email)) {
  // Optionally add to suppression with reason 'role_account'
  await supabase.from('suppression_list').upsert({
    workspace_id,
    email: email.toLowerCase(),
    reason: 'role_account',
    source: 'import',
  });
}
```

### Initialize Warm-up State

Warm-up state is automatically created when you start sending. To manually initialize:

```sql
INSERT INTO warmup_state (workspace_id, account_email, day_index, daily_cap)
VALUES (workspace_id, 'sender@example.com', 1, 20)
ON CONFLICT (workspace_id, account_email) DO NOTHING;
```

### Set Domain Throttling Rules

```sql
INSERT INTO domain_sending_rules (workspace_id, domain, daily_cap, hourly_cap, min_gap_seconds)
VALUES (workspace_id, 'gmail.com', 50, 10, 60)
ON CONFLICT (workspace_id, domain) DO UPDATE
SET daily_cap = EXCLUDED.daily_cap,
    hourly_cap = EXCLUDED.hourly_cap;
```

## 🔒 Security Notes

- All tables use workspace-based RLS policies
- Service role has full access for workers/edge functions
- Suppressed emails are permanently blocked
- Hard bounces are auto-suppressed (can't be undone easily)

## 📊 Metrics & Monitoring

**Deliverability Overview View:**
- `sent_7d` - Emails sent in last 7 days
- `open_rate` - Average open rate (0-1)
- `rep_score` - Reputation score (0-100)

**Bounce Events:**
Query `bounce_events` table for detailed bounce analysis:
```sql
SELECT bounce_type, count(*) 
FROM bounce_events 
WHERE workspace_id = $1 
  AND created_at >= now() - interval '7 days'
GROUP BY bounce_type;
```

## 🎯 Next Steps

1. **Run Migrations** - Apply both SQL migrations
2. **Deploy Edge Function** - Deploy bounce-classifier
3. **Set Up Cron** - Schedule warm-up advancement
4. **Wire Bounce Detection** - Call bounce-classifier from reply detection
5. **Add Dashboard Card** - Include DeliverabilityOverview component
6. **Add Settings Link** - Link to `/settings/deliverability`

## 📝 Notes

- **Warm-up Ramp**: Default is +10 emails per day, max 200/day
- **Gmail/Outlook**: True spam complaints aren't exposed; we rely on NDR/policy rejections
- **DNS Configuration**: Encourage SPF + DKIM + DMARC setup (configured at user's DNS provider)
- **Classifier**: Expand bounce classifier signatures over time, add provider-specific headers parsing

## 🐛 Troubleshooting

**shouldSend() not blocking sends?**
- Check that `workspace_id` and `account_email` are being passed correctly
- Verify warm-up state exists for the account
- Check suppression_list for the recipient

**Warm-up not advancing?**
- Verify cron job is running `fn_warmup_advance()`
- Check warmup_state table for paused accounts
- Ensure `updated_at` is being checked correctly

**Bounce classifier not working?**
- Check edge function logs in Supabase Dashboard
- Verify bounce-parser patterns match your NDR format
- Test with a sample bounce email body

## ✅ Implementation Checklist

- [x] Database migrations (tables + views)
- [x] Helper functions (usage count, warm-up advance, should_send)
- [x] Bounce classifier edge function
- [x] shouldSend() TypeScript library
- [x] Hygiene helpers (role account detection)
- [x] DeliverabilityOverview component
- [x] Deliverability settings page
- [x] Warm-up toggle API
- [x] Worker integration (processQueue)
- [ ] Deploy edge function
- [ ] Set up warm-up cron
- [ ] Wire bounce detection
- [ ] Add dashboard card
- [ ] Add settings navigation link

## 📚 Related Files

- `supabase/migrations/20251101_deliverability.sql` - Core schema
- `supabase/migrations/20251101_deliverability_helpers.sql` - Functions
- `supabase/functions/bounce-classifier/index.ts` - Bounce classifier
- `src/lib/deliverability/shouldSend.ts` - Throttle gate
- `src/lib/hygiene.ts` - Role account detection
- `src/components/deliverability/DeliverabilityOverview.tsx` - Dashboard card
- `src/app/settings/deliverability/page.tsx` - Settings page
- `src/app/api/warmup/toggle/route.ts` - Warm-up API
- `src/lib/scheduler/processQueue.ts` - Worker integration

