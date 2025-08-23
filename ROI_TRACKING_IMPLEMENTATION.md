# ROI Tracking Implementation

This document outlines the implementation of SmartSendAI's ROI tracking system that measures and displays the value users get from the platform.

## Overview

The ROI tracking system monitors:
- **AI replies sent**: Count of AI-generated email replies
- **Meetings booked**: Count of meetings scheduled through the platform
- **Hours saved**: Calculated time savings (5 minutes per reply)

## Components

### 1. Database Schema

**Migration**: `supabase/migrations/20250120_add_meeting_booked_to_ai_reply_events.sql`

```sql
-- Add meeting_booked column to ai_reply_events table
ALTER TABLE public.ai_reply_events
ADD COLUMN IF NOT EXISTS meeting_booked boolean DEFAULT false;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ai_reply_events_meeting_booked ON public.ai_reply_events(meeting_booked);
CREATE INDEX IF NOT EXISTS idx_ai_reply_events_team_meeting ON public.ai_reply_events(team_id, meeting_booked);
```

### 2. Analytics API

**Endpoint**: `/api/analytics/summary`

Returns team-specific ROI metrics:
```typescript
{
  replies: number,      // Total AI replies sent
  meetings: number,     // Meetings booked
  hoursSaved: number   // Calculated hours saved
}
```

### 3. Frontend Components

**RoiCard**: `src/components/RoiCard.tsx`
- Displays ROI metrics in a dashboard card
- Shows upgrade CTA for non-Pro users
- Updates automatically via API calls

**Dashboard Integration**: `src/app/dashboard/page.tsx`
- RoiCard appears at the top for all authenticated users
- Positioned after MonthlyUsageMeter

### 4. Weekly Email Digest

**Cron Job**: `/api/cron/roi-digest`
- Runs weekly to send ROI summaries to team owners
- Includes metrics, time savings, and upgrade prompts
- Uses existing email infrastructure

## Usage

### Tracking AI Replies

When a user sends an AI reply, it's automatically logged to `ai_reply_events`:

```typescript
await supabaseAdmin.from("ai_reply_events").insert({
  team_id: user.team_id,
  user_id: user.id,
  source: 'dashboard',
  meeting_booked: false
});
```

### Marking Meetings as Booked

When a meeting is scheduled (via Calendly callback or ICS click), update the event:

```typescript
await supabaseAdmin
  .from("ai_reply_events")
  .update({ meeting_booked: true })
  .eq("id", eventId);
```

### Displaying ROI

The RoiCard component automatically fetches and displays metrics:

```tsx
<RoiCard />
```

## Configuration

### Environment Variables

- `CRON_SECRET`: Required for cron job authentication
- `NEXT_PUBLIC_APP_URL`: Used in email links

### Cron Schedule

Set up a weekly cron job to call the ROI digest endpoint:

```bash
# Weekly on Monday at 9 AM
0 9 * * 1 curl -X POST https://yourapp.com/api/cron/roi-digest \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Testing

Run the test script to verify implementation:

```bash
npm run tsx scripts/test-roi-tracking.ts
```

## Metrics Calculation

- **Replies**: Direct count from `ai_reply_events`
- **Meetings**: Count where `meeting_booked = true`
- **Hours Saved**: `(replies × 5 minutes) ÷ 60`

## Future Enhancements

1. **Conversion Tracking**: Track replies that lead to meetings
2. **Revenue Attribution**: Connect meetings to actual revenue
3. **Team Comparisons**: Show performance vs. industry benchmarks
4. **Custom Time Savings**: Allow users to set their own time estimates
5. **Integration Metrics**: Track performance across different email sources

## Troubleshooting

### Common Issues

1. **RoiCard not showing**: Check user authentication and team_id
2. **Metrics not updating**: Verify ai_reply_events table has data
3. **Cron job failing**: Check CRON_SECRET environment variable
4. **Email not sending**: Verify email service configuration

### Debug Commands

```sql
-- Check if meeting_booked column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'ai_reply_events' AND column_name = 'meeting_booked';

-- View recent events
SELECT * FROM ai_reply_events 
WHERE team_id = 'your-team-id' 
ORDER BY created_at DESC LIMIT 10;

-- Count meetings vs replies
SELECT 
  COUNT(*) as total_replies,
  COUNT(*) FILTER (WHERE meeting_booked = true) as meetings_booked
FROM ai_reply_events 
WHERE team_id = 'your-team-id';
```

## Security

- All endpoints require authentication
- Cron jobs verify via CRON_SECRET
- RLS policies ensure users only see their team's data
- No sensitive information exposed in metrics 