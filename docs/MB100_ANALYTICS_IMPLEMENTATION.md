# MB/100 Analytics Implementation Guide

This document provides a complete guide to setting up and using the MB/100 (Meetings per 100 Replies) analytics feature.

## Overview

The MB/100 analytics system tracks key performance metrics for email senders:
- **MB/100**: Meetings per 100 replies (conversion metric)
- **Reply → Meeting %**: Percentage of replies that convert to meetings
- **Sender Health Score**: 0-100 score based on volume and conversion rate
- **Daily Trends**: Historical tracking of replies and meetings

## 1. Environment Variables

Ensure these are set in your `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Optional for dev
```

## 2. Database Setup

### Prerequisites

The analytics views expect the following tables and columns:

**messages table:**
- `id` (uuid, primary key)
- `profile_id` (uuid, foreign key to profiles)
- `direction` (text: 'outbound' or 'inbound')
- `created_at` (timestamptz)

**meetings table:**
- `id` (uuid, primary key)
- `profile_id` (uuid, foreign key to profiles)
- `invite_status` (text: 'pending', 'sent', 'failed', or 'booked')
- `created_at` (timestamptz)

### Apply Migration

Run the migration in your Supabase SQL Editor:

```bash
# The migration file is located at:
# supabase/migrations/20241016000000_analytics_mb100_views.sql
```

Or copy/paste the SQL directly into Supabase SQL Editor.

This migration creates:
- **Indexes** for optimized queries on messages and meetings
- **analytics_daily** view: Daily rollup of replies and meetings per profile
- **analytics_totals_30d** view: 30-day aggregated totals and MB/100 calculation
- **analytics_sender_health_30d** view: Sender health score (0-100)

### Understanding the Views

#### analytics_daily
Groups replies and meetings by profile and day for the last 90 days.

#### analytics_totals_30d
Aggregates the last 30 days:
- `replies_30d`: Total inbound messages
- `meetings_30d`: Total meetings with status 'sent' or 'booked'
- `mb_per_100_30d`: (meetings ÷ replies) × 100
- `replies_to_meetings_pct_30d`: Same as MB/100 (kept for clarity)

#### analytics_sender_health_30d
Calculates a 0-100 health score:
- 60% weight on MB/100 (conversion quality)
- 40% weight on reply volume normalized (activity level)

## 3. API Endpoints

### GET /api/analytics

Returns analytics data for one or more profiles.

**Query Parameters:**
- `profileId` (optional): Filter to a specific profile
- `days` (optional, default=14): Number of days to include in trend data (7-90)

**Response:**
```json
{
  "days": 14,
  "data": [
    {
      "profile_id": "uuid",
      "totals": {
        "replies_30d": 50,
        "meetings_30d": 12,
        "mb_per_100_30d": 24.00,
        "replies_to_meetings_pct_30d": 24.00
      },
      "daily": [
        { "day": "2024-10-01", "replies_count": 3, "meetings_count": 1 },
        { "day": "2024-10-02", "replies_count": 5, "meetings_count": 0 }
      ],
      "sender_health_score": 72.5
    }
  ]
}
```

## 4. UI Pages

### /dashboard/analytics

Server-rendered analytics dashboard showing:
- **KPI Cards**: MB/100, Replies→Meetings %, Total Replies, Sender Health
- **Sender Table**: Per-profile breakdown of all metrics
- **Auto-filtering**: Shows data for the current logged-in user

## 5. Installation & Testing

### Install Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### Apply Database Migration

1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `supabase/migrations/20241016000000_analytics_mb100_views.sql`
3. Run the migration

### Seed Test Data

To test the analytics, you need some sample data. Here's a quick SQL snippet:

```sql
-- First, get a profile_id from your profiles table
SELECT id, email FROM profiles LIMIT 1;

-- Replace 'YOUR_PROFILE_ID' below with an actual profile_id from above

-- Insert test messages (replies)
INSERT INTO messages (id, profile_id, direction, created_at)
VALUES
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'inbound', now() - interval '5 days'),
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'inbound', now() - interval '4 days'),
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'inbound', now() - interval '3 days'),
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'inbound', now() - interval '2 days'),
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'inbound', now() - interval '1 days');

-- Insert test meetings
INSERT INTO meetings (id, profile_id, invite_status, created_at)
VALUES
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'sent', now() - interval '3 days'),
  (gen_random_uuid(), 'YOUR_PROFILE_ID', 'booked', now() - interval '1 days');
```

This will create:
- 5 inbound replies
- 2 meetings (sent/booked)
- Expected MB/100: (2/5) × 100 = 40.00

### Run Dev Server

```bash
npm run dev
```

### Test the API

```bash
# Test API endpoint
curl "http://localhost:3000/api/analytics?days=14" | jq

# Test with specific profile
curl "http://localhost:3000/api/analytics?profileId=YOUR_PROFILE_ID&days=14" | jq
```

### Test the UI

Navigate to: http://localhost:3000/dashboard/analytics

You should see:
- KPI cards populated with your test data
- Sender table showing MB/100 = 40.00
- Sender health score

## 6. Acceptance Criteria

✅ `/dashboard/analytics` loads without exposing client secrets (server-side only)  
✅ KPIs show MB/100, Replies → Meetings %, Replies, and Sender Health  
✅ `/api/analytics` returns JSON with daily trend and totals  
✅ Adding more messages and meetings updates MB/100 correctly  
✅ Views perform well (indexed queries)  
✅ Health score reflects both volume and conversion rate  

## 7. Customization

### Adjusting Meeting Status

If your app uses different meeting statuses, update the view:

```sql
-- In analytics_daily view, change this line:
COALESCE(SUM(CASE WHEN mt.invite_status IN ('sent','booked') THEN 1 ELSE 0 END), 0) AS meetings_count

-- To include your custom statuses, e.g.:
COALESCE(SUM(CASE WHEN mt.invite_status IN ('confirmed','completed') THEN 1 ELSE 0 END), 0) AS meetings_count
```

### Adjusting Health Score Weights

The sender health score uses:
- 60% MB/100 weight
- 40% reply volume weight

To adjust, modify `analytics_sender_health_30d` view:

```sql
-- Change the weights in this calculation:
ROUND( LEAST(100,
  (0.6 * LEAST(100, mb_per_100_30d)) +
  (0.4 * COALESCE((replies_30d::numeric / NULLIF(max_replies,0)) * 100, 0))
), 1) AS sender_health_score

-- Example: 80% MB/100, 20% volume
ROUND( LEAST(100,
  (0.8 * LEAST(100, mb_per_100_30d)) +
  (0.2 * COALESCE((replies_30d::numeric / NULLIF(max_replies,0)) * 100, 0))
), 1) AS sender_health_score
```

## 8. Next Steps

### Recommended Enhancements

1. **Campaign-level analytics**: Break down MB/100 by campaign
2. **Funnel visualization**: Sends → Delivered → Opens → Replies → Meetings
3. **Alerts**: Notify when MB/100 drops below threshold
4. **A/B testing integration**: Track MB/100 for different variants
5. **Team aggregation**: Roll up metrics across team members
6. **Export functionality**: CSV/PDF reports
7. **Historical trends**: Compare 30d vs 60d vs 90d

### Performance Considerations

For high-volume deployments:
- Consider materialized views instead of regular views
- Add a scheduled refresh job for materialized views
- Implement caching at the API layer
- Add pagination to the sender table

## 9. Troubleshooting

### No data showing

1. Check that messages and meetings exist in the database
2. Verify `profile_id` matches between messages, meetings, and profiles tables
3. Ensure messages have `direction = 'inbound'` for replies
4. Ensure meetings have `invite_status IN ('sent', 'booked')`
5. Check that `created_at` is within the last 90 days

### Views not found

Re-run the migration SQL in Supabase SQL Editor.

### Permission errors

The API uses the service role key (supabaseAdmin), so RLS is bypassed. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set correctly.

### MB/100 calculation seems wrong

Verify the data:
```sql
SELECT 
  profile_id,
  SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as replies,
  (SELECT COUNT(*) FROM meetings m WHERE m.profile_id = msg.profile_id AND invite_status IN ('sent','booked')) as meetings
FROM messages msg
WHERE created_at >= now() - interval '30 days'
GROUP BY profile_id;
```

## 10. Architecture Notes

### Why Views Instead of Real-time Queries?

- **Performance**: Pre-aggregated data is faster to query
- **Consistency**: All consumers use the same calculation logic
- **Maintainability**: Update logic in one place (the view)

### Why Service Role Instead of RLS?

- **Simplicity**: Analytics is read-only and doesn't expose sensitive data
- **Performance**: Bypassing RLS reduces query complexity
- **Future-proofing**: Easy to add RLS later if needed

### Why 30-day Window?

30 days provides:
- Recent enough to be actionable
- Enough data points for statistical significance
- Fast query performance

The 90-day retention in `analytics_daily` allows for expanding the window without re-architecting.

## 11. Support

For questions or issues:
1. Check the troubleshooting section above
2. Review the SQL views in Supabase SQL Editor
3. Test the API endpoint directly with curl
4. Check server logs for error messages
