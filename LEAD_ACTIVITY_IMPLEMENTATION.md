# Lead Activity Timeline - Implementation Summary

## Overview

Fast aggregates for lead list view and per-lead timeline tracking with realtime updates.

## Files Created

### Database (1 file)
- `supabase/migrations/20250227000002_lead_activity_view.sql` - View with aggregated lead activity data

### API Routes (2 files)
- `src/app/api/leads/activity/route.ts` - List view with search and pagination
- `src/app/api/leads/[leadId]/timeline/route.ts` - Timeline data for individual leads

### UI Components (2 files)
- `src/components/timeline/LeadTimelineCard.tsx` - Individual lead timeline with realtime updates
- `src/components/timeline/LeadListWithActivity.tsx` - List view with activity badges

### Pages (1 file)
- `src/app/leads/[leadId]/page.tsx` - Lead detail page mounting the timeline card

## Features

✅ **Fast Aggregates** - PostgreSQL view pre-computes opens, clicks, replies per lead
✅ **List View** - Search leads with activity badges (opens, clicks, replied)
✅ **Timeline** - Chronological event feed with icons
✅ **Realtime Updates** - Supabase Realtime subscriptions for live data
✅ **Edge Runtime** - Fast API routes using Edge runtime

## Usage

### View Lead Timeline
```
GET /api/leads/:leadId/timeline
```

Returns:
```json
{
  "events": [
    {
      "id": "uuid",
      "event_type": "sent|delivered|opened|clicked|replied|bounced",
      "meta": {},
      "created_at": "timestamp",
      "email_id": "uuid",
      "campaign_id": "uuid"
    }
  ]
}
```

### List Leads with Activity
```
GET /api/leads/activity?q=search&limit=25&offset=0
```

Returns:
```json
{
  "rows": [
    {
      "lead_id": "uuid",
      "email": "email@example.com",
      "name": "Name",
      "last_event_at": "timestamp",
      "last_event_type": "opened",
      "opens": 3,
      "clicks": 1,
      "replied": true
    }
  ],
  "total": 50
}
```

### React Components

**Timeline Card:**
```tsx
import LeadTimelineCard from "@/components/timeline/LeadTimelineCard";

<LeadTimelineCard leadId="uuid" />
```

**List View:**
```tsx
import LeadListWithActivity from "@/components/timeline/LeadListWithActivity";

<LeadListWithActivity />
```

**Lead Detail Page:**
```
/leads/:leadId
```
Automatically displays timeline for the lead.

## Setup

1. **Apply Database Migration**
   ```sql
   -- Run in Supabase SQL Editor
   -- File: supabase/migrations/20250227000002_lead_activity_view.sql
   ```

2. **Environment Variables** (already configured)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. **Start Dev Server**
   ```bash
   npm run dev
   ```

## Database Schema

**lead_activity view** (read-only):
- `lead_id` - UUID
- `last_event_at` - Timestamp
- `last_event_type` - Text
- `opens` - Count
- `clicks` - Count
- `replied` - Boolean

**email_events table** (source):
- Must have `event_type` column with values: 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced'
- Must have `lead_id` foreign key to `leads` table

## Next Steps

- Add infinite scroll to list view
- Add "Hot Leads" filter (opens>=2 OR clicks>=1 AND replied=false)
- Color-code cards by activity level
- Add export to CSV functionality

