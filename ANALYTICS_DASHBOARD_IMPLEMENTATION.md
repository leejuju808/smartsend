# Analytics Dashboard Implementation

## Overview

This implementation adds a comprehensive campaign analytics dashboard to track email performance metrics including sends, opens, clicks, replies, and reply rates.

## Files Created/Modified

### 1. Supabase View
**File:** `supabase/sql/create_v_campaign_metrics_view.sql`

Creates a view `v_campaign_metrics` that aggregates campaign performance data from multiple tables:
- `campaigns` - Campaign metadata
- `send_logs` - Email sending records
- `email_events` - Open and click tracking
- `email_replies` - Reply tracking

### 2. Analytics Page
**File:** `src/app/dashboard/analytics/page.tsx`

A client-side React component that displays:
- Metric cards with total sends, opens, clicks, and replies
- 7-day performance trend chart (line chart)
- Top performing campaigns table
- Date range filters (7d, 30d, all time)
- Auto-refresh toggle (60s intervals)

### 3. API Route
**File:** `src/app/api/dashboard/analytics/route.ts`

Server-side API endpoint that:
- Fetches campaign metrics from the Supabase view
- Aggregates daily statistics
- Filters by workspace and date range
- Returns formatted JSON data

## Setup Instructions

### 1. Create the Database View

Run the SQL file to create the view:

```bash
# Using Supabase CLI
supabase db reset

# Or manually in Supabase Dashboard > SQL Editor
# Copy and paste the contents of:
# supabase/sql/create_v_campaign_metrics_view.sql
```

### 2. Install Dependencies (if needed)

```bash
npm install recharts
```

### 3. Verify Table Structure

Ensure these tables exist in your database:
- `campaigns` - with columns: `id`, `name`, `workspace_id`
- `send_logs` - with columns: `id`, `campaign_id`, `status`, `workspace_id`, `created_at`
- `email_events` - with columns: `id`, `campaign_id`, `event_type` (values: 'open', 'click')
- `email_replies` - with columns: `id`, `campaign_id`, `created_at`

## Features

### Metric Cards
- **📬 Total Sends:** Total number of emails sent
- **📖 Opens:** Total unique opens with open rate percentage
- **🖱️ Clicks:** Total unique clicks with CTR percentage
- **💬 Replies:** Total replies with reply rate percentage (highlighted card)

### 7-Day Performance Chart
- Line chart showing sends vs replies over the last 7 days
- Uses recharts library for visualization
- Responsive design

### Top Campaigns Table
- Shows top 10 campaigns by reply count
- Columns: Campaign name, Sent count, Opens, Clicks, Replies, Reply Rate
- Sorted by reply count descending
- Reply rate shown as a badge

### Filters
- **Date Range:** 7 days, 30 days, or All time
- **Auto-refresh:** Toggle to enable/disable automatic data refresh every 60 seconds

## API Response Format

```json
{
  "totals": {
    "sent": 1242,
    "opens": 718,
    "clicks": 356,
    "replies": 93,
    "reply_rate": 7.5
  },
  "daily": [
    {
      "date": "2024-01-20",
      "sends": 45,
      "replies": 3
    }
  ],
  "campaigns": [
    {
      "campaign_id": "uuid",
      "name": "Campaign Name",
      "sent_count": 150,
      "opens": 90,
      "clicks": 45,
      "replies": 12,
      "reply_rate": 8.0
    }
  ]
}
```

## Customization

### Change Date Range Presets

Edit the `DATE_PRESETS` array in `src/app/dashboard/analytics/page.tsx`:

```typescript
const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: null },
];
```

### Adjust Auto-refresh Interval

Change the interval in the `useEffect` hook:

```typescript
const interval = setInterval(() => loadData(), 60000); // 60000ms = 60s
```

### Modify Chart Type

Replace `LineChart` with `BarChart` or `AreaChart` in the chart component:

```typescript
<BarChart data={dailyData.slice(-7)}>
  // ... rest of config
</BarChart>
```

## Troubleshooting

### View Not Found Error

If you get an error that the view doesn't exist:
1. Check that the SQL file was executed
2. Verify the view exists: `SELECT * FROM v_campaign_metrics LIMIT 1;`
3. Check permissions: Ensure the database role has read access to the view

### No Data Showing

1. Verify that campaigns exist with the correct `workspace_id`
2. Check that `send_logs` has records with `status='sent'`
3. Ensure `email_events` and `email_replies` tables have data
4. Check browser console for API errors

### API Error 401/403

1. Verify workspace authentication is working
2. Check that `requireWorkspace` middleware is functioning
3. Ensure the API route has proper error handling

## Future Enhancements

- Add campaign comparison feature
- Implement export to CSV
- Add drill-down to individual campaign details
- Real-time updates using Supabase subscriptions
- Add more chart types (pie charts, stacked bars)
- Campaign performance predictions
- A/B test results

## Dependencies

- `recharts` - Chart library for React
- `@supabase/supabase-js` - Supabase client
- Next.js 14+ - React framework

## Related Files

- `src/app/dashboard/page.tsx` - Main dashboard
- `src/app/dashboard/components/KPICard.tsx` - Reusable KPI card component
- `src/app/dashboard/components/TimeSeriesChart.tsx` - Time series chart component
- `src/lib/supabase/server.ts` - Supabase server client
- `src/lib/workspace/withWorkspace.ts` - Workspace authentication middleware