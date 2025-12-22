# Campaign Dashboard Setup Guide

This document outlines the setup for the campaign dashboard with metrics, charts, and analytics.

## 1. Install Dependencies

```bash
npm install swr recharts
```

## 2. SQL Setup

Run the SQL migration file in Supabase:

```sql
-- File: supabase/migrations/create_dashboard_indexes.sql

-- Speed up dashboard
create index if not exists idx_campaign_logs_ws_event_created
  on campaign_logs (campaign_id, event, created_at);

create index if not exists idx_send_queue_ws_status_scheduled
  on send_queue (campaign_id, status, scheduled_at);

-- Optional: if campaigns table exists and carries workspace_id, wire a quick view for logs with workspace_id
create or replace view v_campaign_logs_ws as
select cl.*, c.workspace_id
from campaign_logs cl
join campaigns c on c.id = cl.campaign_id;

create or replace view v_send_queue_ws as
select sq.*, c.workspace_id
from send_queue sq
join campaigns c on c.id = sq.campaign_id;

-- 7-day series helper (UTC)
create or replace view v_last7 as
select generate_series(date_trunc('day', now()) - interval '6 days',
                       date_trunc('day', now()),
                       interval '1 day')::date as d;
```

### SQL Views (Required)

The API uses direct Supabase queries instead of RPC helpers for better type safety. Make sure you have the views created from the migration file above.

## 3. Files Created

### API Endpoint
- `src/app/api/dashboard/metrics/route.ts` - Returns totals (queued, sent, failed, replied) + 7-day series data

### Components
- `src/components/dashboard/DashboardTiles.tsx` - Displays metric tiles (Queued, Sent, Failed, Replied)
- `src/components/dashboard/Sparkline.tsx` - Displays 7-day line chart

### SQL Migration
- `supabase/migrations/create_dashboard_indexes.sql` - Database indexes and views

## 4. Usage in Your Dashboard Page

```tsx
// app/(app)/dashboard/page.tsx (example)
import DashboardTiles from "@/components/dashboard/DashboardTiles";
import Sparkline from "@/components/dashboard/Sparkline";

export default async function Page() {
  // Get workspace from session/auth context
  const workspaceId = "YOUR_ACTIVE_WORKSPACE_ID"; 
  
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Campaign Dashboard</h1>
      <DashboardTiles workspaceId={workspaceId} />
      <Sparkline workspaceId={workspaceId} />
    </div>
  );
}
```

## 5. Features

### Dashboard Tiles
- **Auto-refresh**: Updates every 15 seconds
- **Metrics**: Queued, Sent, Failed, Replied counts
- **Real-time**: Shows live campaign status

### 7-Day Chart
- **Auto-refresh**: Updates every 30 seconds  
- **Metrics**: Sent, Failed, Replied over last 7 days
- **Visualization**: Line chart with legends and tooltips

## 6. Troubleshooting

### Missing Dependencies
Make sure to run `npm install swr recharts` before using the components.

### Table/Column Name Mismatches
If your schema uses different column names (e.g., `workspace_id` vs `workspaceId`), update the API queries accordingly.

### No Data Showing
Make sure you have campaigns created in your workspace, as the dashboard aggregates data from campaigns.

### TypeScript Errors
If you see TypeScript errors about missing modules, make sure you've installed the dependencies: `npm install swr recharts`

## 7. Performance Notes

- **Indexes**: The SQL migration creates indexes for fast queries on `campaign_logs` and `send_queue`
- **Views**: Materialized views join with campaigns to get workspace_id efficiently
- **Caching**: SWR provides automatic caching and revalidation for API requests 