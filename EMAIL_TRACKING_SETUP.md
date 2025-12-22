# Email Tracking Implementation

This implementation adds opens/clicks tracking for leads in the SmartSend system.

## Summary

The tracking system captures:
- **Opens**: When a lead opens an email (via tracking pixel)
- **Clicks**: When a lead clicks a link in an email (via redirect tracking)

## Files Created/Modified

### Database Migration
- **`supabase/migrations/20251030_email_tracking_events.sql`**
  - Creates `lead_tracking_tokens` table (one token per workspace/campaign/lead)
  - Creates `lead_email_events` table (stores all open/click events)
  - Creates `v_lead_engagement` view (aggregates opens/clicks per lead)
  - Creates `lead_engagement_counts()` function (batch fetch counts)

### API Endpoints
- **`src/app/api/tracking/o/[token]/route.ts`** - Open tracking pixel endpoint
- **`src/app/api/tracking/c/route.ts`** - Click tracking redirect endpoint
- **`src/app/api/leads/engagement/route.ts`** - Engagement counts API

### Send Worker
- **`supabase/functions/sendWorker/index.ts`**
  - Added `getOrCreateToken()` helper
  - Added `wrapLinksWithTracking()` function
  - Added `injectOpenPixel()` function
  - Integrated tracking into email sending flow

### UI Components
- **`src/components/LeadsTable.tsx`**
  - Added `useEngagement()` hook to fetch counts
  - Added "Opens" and "Clicks" columns to table
  - Extended Lead interface with optional opens/clicks fields

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
supabase db push
# Or manually in Supabase SQL editor:
# Run the contents of supabase/migrations/20251030_email_tracking_events.sql
```

### 2. Set Environment Variables

#### For Supabase Edge Function (sendWorker)
Set in Supabase Dashboard → Functions → Secrets:

```
APP_BASE_URL=https://your-app-domain.com
```

Or when deploying locally:

```bash
supabase secrets set APP_BASE_URL=https://your-app-domain.com
```

**Note**: Replace with your actual app domain. This is used to generate tracking pixel URLs.

### 3. Deploy the Send Worker

```bash
supabase functions deploy sendWorker
```

### 4. Test the Integration

1. Send a test email through your campaign
2. Open the email and click a link
3. Check the leads table - you should see opens and clicks counts

## How It Works

### Email Sending Flow

1. **Token Creation**: When sending an email to a lead, the worker creates a unique tracking token (reused per lead/campaign)
2. **HTML Processing**: 
   - All links are wrapped with click tracking: `{APP_BASE_URL}/api/tracking/c?t={token}&u={url}`
   - A 1x1 transparent PNG pixel is injected: `<img src="{APP_BASE_URL}/api/tracking/o/{token}" />`
3. **Email Sent**: The processed HTML is sent to the recipient

### Open Tracking

1. When the email is opened, the tracking pixel loads
2. Browser requests: `GET /api/tracking/o/{token}`
3. Endpoint:
   - Looks up the token in `lead_tracking_tokens`
   - Records an "open" event in `lead_email_events`
   - Returns a 1x1 transparent PNG

### Click Tracking

1. User clicks a link in the email
2. Link goes to: `/api/tracking/c?t={token}&u={destination_url}`
3. Endpoint:
   - Looks up the token
   - Records a "click" event with the destination URL
   - Redirects to the actual destination URL

### Dashboard Display

1. LeadsTable component calls `useEngagement()` hook
2. Hook fetches engagement counts for visible leads via `/api/leads/engagement`
3. API calls `lead_engagement_counts()` database function
4. Results are displayed in "Opens" and "Clicks" columns

## Database Schema

### Tables

**lead_tracking_tokens**
```sql
- id (uuid, primary key)
- workspace_id (uuid)
- campaign_id (uuid)
- lead_id (uuid)
- created_at (timestamptz)
```

**lead_email_events**
```sql
- id (uuid, primary key)
- workspace_id (uuid)
- campaign_id (uuid)
- lead_id (uuid)
- token_id (uuid, FK → lead_tracking_tokens.id)
- type (text, 'open' or 'click')
- url (text, nullable, for clicks)
- ua (text, user agent)
- ip (inet, IP address)
- created_at (timestamptz)
```

### Views & Functions

- **v_lead_engagement**: Aggregates opens/clicks per lead_id
- **lead_engagement_counts()**: Batch fetches counts for multiple leads

## Next Steps / Future Enhancements

1. **Time-based Analytics**: Track first open/click times, last open/click times
2. **Campaign-level Aggregates**: Show total opens/clicks per campaign
3. **Link-level Tracking**: Track individual links separately (current: all links share one click count)
4. **Device/Browser Analytics**: Parse user agent for device/browser info
5. **Geographic Analytics**: Lookup IP → location
6. **Delivered/Bounced Tracking**: Add email delivery status events
7. **Unsubscribe Tracking**: Track unsubscribe clicks

## Troubleshooting

### Tracking not working?

1. **Check APP_BASE_URL**: Must be set in Supabase Edge Function secrets
2. **Check migration**: Ensure tables were created successfully
3. **Check browser console**: Look for 404 errors on pixel loads
4. **Check database**: Query `lead_email_events` to see if events are being recorded

### Link wrapping not working?

The regex-based link wrapping is basic. For production, consider using a proper HTML parser library.

### Performance concerns?

- The engagement hook fetches counts for all visible rows on every render
- Consider debouncing or pagination to limit fetches
- Add caching layer if needed for large datasets

