# AUREV HQ Unified Dashboard Setup

## Overview

The AUREV HQ Unified Dashboard provides a single command center for monitoring metrics across SmartSend, OpsGrid, and AgentCloud.

## Files Created

### Database Migration
- `supabase/migrations/20260103000000_hq_unified_dashboard.sql`
  - Creates `events_bus` table for cross-app events
  - Creates `app_revenue` table for MRR/ARR tracking
  - Creates views: `vw_active_orgs_30d`, `vw_activity_daily`, `vw_mrr_app`, `vw_hq_overview`
  - Sets up RLS policies for org-level security

### Edge Function
- `supabase/functions/hq_event_write/index.ts`
  - POST endpoint for inserting events into the events bus
  - CORS-enabled for cross-app usage
  - Validates app, type, org_id, user_id

### Next.js UI Components
- `src/components/hq/HQCards.tsx` - KPI cards (MRR, ARR, Active Orgs, Events)
- `src/components/hq/HQTrend.tsx` - 30-day activity trend chart
- `src/components/hq/HQActivity.tsx` - Recent activity feed

### Dashboard Page
- `src/app/hq/dashboard/page.tsx` - Main HQ dashboard with admin toggle

### API Route
- `src/app/api/hq/metrics/route.ts` - Fetches metrics with org/global view support

## Setup Instructions

### 1. Apply Database Migration

Run the SQL migration in Supabase Dashboard:
```bash
# Copy contents of supabase/migrations/20260103000000_hq_unified_dashboard.sql
# Paste into Supabase SQL Editor and run
```

Or via Supabase CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy hq_event_write
```

### 3. Wire Events from Apps

Each app should POST events to the events bus:

```typescript
// Example: SmartSend campaign sent
await fetch(`${SUPABASE_URL}/functions/v1/hq_event_write`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({
    app: 'smartsend',
    org_id: currentOrgId,
    user_id: currentUserId,
    type: 'campaign_sent',
    meta: { campaign_id, email_count }
  })
});
```

**Event Types to Track:**
- SmartSend: `campaign_sent`, `campaign_replied`, `lead_generated`
- OpsGrid: `workflow_triggered`, `task_completed`, `automation_run`
- AgentCloud: `agent_deployed`, `message_sent`, `job_completed`

### 4. Populate Revenue Data

Revenue data should be synced from Stripe or your billing system:

```typescript
// Example: Monthly revenue snapshot
await supabase.from('app_revenue').insert({
  app: 'smartsend',
  org_id: orgId,
  period: '2026-01-01',
  mrr: 999.00
});
```

### 5. Access Dashboard

Navigate to: `/hq/dashboard`

## Features

### Org View (Default)
- Shows metrics for the current user's org only
- Filtered by RLS policies

### Global View (Admin Only)
- Shows aggregated metrics across all orgs
- Only visible to users with `owner` role
- Toggle appears when user has admin privileges

### Real-time Updates
- Dashboard refreshes every 30 seconds
- Uses SWR for efficient data fetching

### KPIs Displayed
1. **Total MRR** - Combined monthly recurring revenue
2. **Total ARR** - Combined annual recurring revenue
3. **Active Orgs (30d)** - Orgs with activity in last 30 days
4. **Events (24h)** - Total events in last 24 hours

### Activity Chart
- 30-day timeline with separate lines per app
- Shows event volume trends
- Uses Recharts for visualization

### Recent Activity Feed
- Last 20 events across all apps
- Color-coded by app (SmartSend=blue, OpsGrid=green, AgentCloud=purple)
- Shows event type and timestamp

## Testing

### 1. Insert Test Events

```sql
-- Insert test event
INSERT INTO events_bus (app, org_id, user_id, type, meta)
VALUES ('smartsend', '<org-id>', '<user-id>', 'campaign_sent', '{"test": true}');

-- Insert test revenue
INSERT INTO app_revenue (app, org_id, period, mrr)
VALUES ('smartsend', '<org-id>', CURRENT_DATE, 500);
```

### 2. Verify Views

```sql
SELECT * FROM vw_hq_overview;
SELECT * FROM vw_activity_daily;
SELECT * FROM vw_mrr_app;
```

### 3. Test Dashboard

1. Navigate to `/hq/dashboard`
2. Verify KPIs display correctly
3. Check activity chart renders
4. Test admin toggle (if you have owner role)

## RLS Security

The dashboard uses Row-Level Security:
- Events are filtered by org membership
- Admins can see org events
- Service role can insert events
- Views respect RLS policies

## Next Steps

1. **Wire Up SmartSend** - Add event tracking to campaign sends, replies, etc.
2. **Wire Up OpsGrid** - Track workflow runs, task completions
3. **Wire Up AgentCloud** - Track agent deployments, message sends
4. **Add Revenue Tracking** - Sync MRR from Stripe/billing system
5. **Set Up Monitoring** - Add alerts for unusual activity

## Troubleshooting

### No Data Showing
- Verify events are being inserted into `events_bus`
- Check RLS policies allow your user to read events
- Ensure views are created: `SELECT * FROM vw_hq_overview;`

### Edge Function Error
- Verify SUPABASE_URL and SERVICE_ROLE_KEY are set
- Check CORS headers if calling from external domains
- Review function logs in Supabase dashboard

### Chart Not Rendering
- Ensure Recharts is installed: `npm install recharts`
- Check browser console for errors
- Verify data format matches expected structure

