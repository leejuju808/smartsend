# Marketing Engine Automation Setup Guide

This guide explains how to set up and use the Marketing Engine Automation system for SmartSend.

## Overview

The Marketing Engine automates your weekly marketing output:
- **Twitter/X Threads**: Auto-publish scheduled threads
- **Video Posts**: Track and schedule video uploads
- **Email Broadcasts**: Send updates to waitlist and active users

## Database Setup

### 1. Run the Migration

```bash
supabase migration up
```

Or manually run in Supabase SQL Editor:
```sql
-- See: supabase/migrations/20250201000000_marketing_engine.sql
```

This creates:
- `marketing_posts` table with scheduling and metrics
- Performance tracking function `get_marketing_performance()`
- Indexes for fast queries

## Edge Functions Setup

### 2. Deploy Marketing Publisher

The marketing-publisher function automatically publishes scheduled posts:

```bash
supabase functions deploy marketing-publisher
```

### 3. Configure Environment Variables

Set these in Supabase Dashboard → Edge Functions → Settings:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
X_BEARER_TOKEN=your_x_twitter_bearer_token  # For Twitter/X posts
```

### 4. Deploy Email Broadcast Function

```bash
supabase functions deploy email-broadcast
```

Additional environment variables for email-broadcast:

```bash
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=SmartSend <noreply@smartsend.ai>
```

### 5. Schedule the Publisher (Cron Job)

To run the marketing-publisher every Monday at 9 AM UTC, create a cron job:

**Option A: Via Supabase Dashboard**
1. Go to Database → Cron Jobs
2. Create new job:
   - **Name**: `marketing-publisher-weekly`
   - **Schedule**: `0 9 * * 1` (Every Monday at 9 AM UTC)
   - **Target**: Edge Function
   - **Function**: `marketing-publisher`
   - **Method**: GET

**Option B: Via SQL**

Run in Supabase SQL Editor:

```sql
-- Schedule marketing-publisher to run every Monday at 9 AM UTC
SELECT cron.schedule(
  'marketing-publisher-weekly',
  '0 9 * * 1', -- Every Monday at 9 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/marketing-publisher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**For More Frequent Runs** (e.g., every hour to catch scheduled posts):

```sql
-- Run every hour to check for due posts
SELECT cron.schedule(
  'marketing-publisher-hourly',
  '0 * * * *', -- Every hour
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/marketing-publisher',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

## Usage

### Creating Marketing Posts

1. Navigate to `/admin/marketing`
2. Click "+ New Post"
3. Choose post type:
   - **Thread**: X/Twitter thread (requires X_BEARER_TOKEN)
   - **Video**: Manual upload tracking
   - **Email**: Broadcast to waitlist + users
4. Set status:
   - **Draft**: Save for later editing
   - **Scheduled**: Auto-publish at specified time

### Weekly Content Loop

| Day | Task | Status |
|-----|------|--------|
| Mon | Post new thread (feature launch / case study) | ✅ Automated via publisher |
| Tue | Post short video demo | Manual upload, mark as published |
| Thu | Send email update to users | ✅ Automated via email-broadcast |
| Fri | Track metrics and log best-performing post | ✅ Via dashboard |

### Tracking Performance

View aggregated metrics:

```sql
SELECT * FROM get_marketing_performance();
```

Or via API:
```bash
GET /api/marketing/performance
```

Returns:
- Average clicks, signups, likes, retweets per post type
- Total posts by type
- Performance comparison across content types

### Updating Metrics

After publishing, update metrics via API:

```bash
PATCH /api/marketing/{id}
{
  "metrics": {
    "likes": 120,
    "retweets": 18,
    "clicks": 45,
    "signups": 12
  }
}
```

## API Endpoints

### Marketing Posts

- `GET /api/marketing` - List all posts (with optional `?status=draft&type=thread`)
- `POST /api/marketing` - Create new post
- `GET /api/marketing/{id}` - Get post details
- `PATCH /api/marketing/{id}` - Update post
- `DELETE /api/marketing/{id}` - Delete post

### Performance Metrics

- `GET /api/marketing/performance` - Get aggregated performance data

## Twitter/X Integration

To enable Twitter/X thread publishing:

1. Get a Bearer Token from X Developer Portal
2. Set `X_BEARER_TOKEN` in edge function environment
3. The function uses X API v2 endpoint: `https://api.x.com/v2/tweets`

**Note**: X API requires OAuth 2.0 with specific scopes. The current implementation uses Bearer Token authentication which may have limitations. For full functionality, consider implementing OAuth 2.0 flow.

## Email Broadcast

The email-broadcast function:
- Sends to all emails in `waitlist` table
- Sends to all active users in `profiles` table
- Logs sends to `waitlist_emails` table
- Processes in batches to avoid rate limits
- Returns count of sent/failed emails

## Troubleshooting

### Posts not publishing

1. Check cron job is running:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobname = 'marketing-publisher-weekly' 
   ORDER BY start_time DESC LIMIT 5;
   ```

2. Manually trigger the function:
   ```bash
   supabase functions invoke marketing-publisher
   ```

3. Check function logs in Supabase Dashboard

### Twitter posts failing

- Verify `X_BEARER_TOKEN` is set correctly
- Check X API rate limits
- Ensure Bearer Token has proper permissions

### Email broadcasts not sending

- Verify `RESEND_API_KEY` is configured
- Check Resend rate limits (typically 100 emails/day on free tier)
- Review edge function logs for errors

## Performance Tracking Dashboard

The marketing dashboard (`/admin/marketing`) shows:
- Total, scheduled, published, and draft post counts
- Post cards with status badges and metrics
- Quick links to view/edit posts
- Real-time updates (refreshes every 30 seconds)

## Next Steps

1. ✅ Marketing posts table + cron publisher live
2. ✅ Admin UI to schedule threads, emails, videos
3. ✅ Weekly content loop runs automatically
4. ✅ Performance metrics track traffic & signups
5. 🎯 Inbound leads increase each week → predictable growth

---

**Questions?** Check the edge function logs or Supabase dashboard for detailed error messages.

