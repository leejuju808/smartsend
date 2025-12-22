# Engagement Metrics Dashboard Implementation

## Overview
This feature adds an engagement metrics dashboard that shows open/click rates for each campaign with live updates via Supabase realtime subscriptions.

## Files Created

### 1. SQL Migration: `supabase/migrations/20250131_campaign_metrics_view.sql`
- Creates a `campaign_metrics` view that aggregates:
  - Total emails sent per campaign
  - Opens and clicks per campaign
  - Open rate and click rate percentages
  - Last activity timestamp
- Adds index on `email_logs(campaign_id)` for performance
- Grants select access to authenticated users

### 2. Dashboard Page: `src/app/dashboard/engagement/page.tsx`
- Client component wrapper that exports the main EngagementClient

### 3. Dashboard Client: `src/app/dashboard/engagement/EngagementClient.tsx`
- **Features:**
  - Summary cards showing total sent, overall open rate, and overall click rate
  - Searchable table with per-campaign metrics
  - Interactive bar chart comparing open vs click rates
  - Real-time updates when email_logs change
  - Workspace-aware filtering
  - Empty state when no campaigns exist

## Technical Details

### Database Schema
- Uses existing `campaigns` table with `name`, `user_id`, and `workspace_id`
- Uses existing `email_logs` table with `opened_at` and `clicked_at` timestamps
- Workspace filtering ensures users only see data from their active workspace

### Real-time Updates
- Subscribes to `postgres_changes` on the `email_logs` table
- Automatically refreshes when opens/clicks are tracked
- Efficient polling through Supabase realtime

### UI Components Used
- `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`
- `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` from `@/components/ui/table`
- `Input` from `@/components/ui/input`
- `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend` from `recharts`

### Dependencies
- `recharts` is already installed in package.json (v2.13.3)
- No new dependencies needed

## Usage

1. **Apply Migration**: Run the SQL migration in your Supabase instance
2. **Access Dashboard**: Navigate to `/dashboard/engagement`
3. **View Metrics**: See aggregated metrics across all campaigns in your active workspace
4. **Live Updates**: Metrics update automatically when emails are opened or clicked

## Future Enhancements

The implementation includes a foundation for future chart expansion:
- Daily trend view can be added using the optional `campaign_engagement_daily` view
- More granular filtering (by date range, campaign status, etc.)
- Export functionality for campaign reports
- Drill-down to individual campaign details

## Optional: Daily Trend View

A commented-out section in the original specification provides an optional daily trend view:

```sql
create or replace view campaign_engagement_daily as
with events as (
  select
    el.campaign_id,
    date_trunc('day', coalesce(el.opened_at, el.clicked_at, el.created_at))::date as day,
    (el.opened_at is not null)::int as is_open,
    (el.clicked_at is not null)::int as is_click
  from email_logs el
)
select
  e.campaign_id,
  e.day,
  sum(e.is_open)  as opens,
  sum(e.is_click) as clicks
from events e
group by e.campaign_id, e.day
order by e.day desc;
```

This can be added later for time-series analysis.
