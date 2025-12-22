# Block 28412 — SmartSend Roofing "Past Customer Reactivation Engine" v1

**FULL. NO BULLSHIT. BUILT FOR REVENUE.**

## ✅ Implementation Complete

This feature wakes up dead customer files, auto-detects old customers, sends offers, and generates repeat revenue for roofers with zero ad spend.

## 🚀 Why This Feature Matters

Roofers lose millions collectively because they never re-engage their old customers. SmartSend fixes that by:
- Waking up every past job
- Auto-sending seasonal offers
- Detecting roofs at "replacement age"
- Turning ignored homeowners into fresh booked estimates
- Creating repeat & referral revenue with zero ad spend

## 📦 What Was Built

### 1. Database Schema (`supabase/migrations/20250303000000_block28412_past_customer_reactivation_engine_v1.sql`)

#### Tables Created:
- **`past_customers`** - Stores past customer data when jobs are completed
  - Links to `workspace_id`, `lead_id`, `job_id`
  - Stores job completion date, roof type, warranty info, contact details
  - Auto-populated via trigger when job status changes to 'completed'

- **`reactivation_events`** - Tracks scheduled and sent reactivation messages
  - Event types: `3m`, `1y`, `3y`, `5y`, `7y`, `10y`, `seasonal`
  - Status tracking: `scheduled`, `sent`, `replied`, `booked`, `cancelled`
  - Links to past customers and tracks revenue

#### Functions Created:
- **`log_past_customer()`** - Trigger function that creates past customer record when job is completed
- **`generate_reactivation_events(p_workspace_id)`** - Generates reactivation events based on time windows
- **`get_reactivation_stats(p_workspace_id)`** - Returns dashboard statistics

#### Triggers:
- **`past_customer_trigger`** - Fires on `roofing_jobs.status` update to 'completed'

### 2. Edge Functions

#### `supabase/functions/schedule-reactivation/index.ts`
- Generates reactivation events for past customers
- Calls database function `generate_reactivation_events`
- Can process all workspaces or filter by workspace_id

#### `supabase/functions/send-reactivation-message/index.ts`
- Sends SMS + Email for reactivation events
- Supports Vonage/Nexmo and Twilio for SMS
- Generates appropriate messages based on event type (3m, 1y, 3y, 5y, 7y, 10y)
- Updates event status after sending

### 3. API Routes

#### `app/api/reactivation/stats/route.ts`
- **GET** `/api/reactivation/stats?workspace_id=xxx`
- Returns dashboard statistics:
  - Past customers count
  - Events scheduled/sent/replied/booked
  - Estimated revenue

#### `app/api/reactivation/events/route.ts`
- **GET** `/api/reactivation/events?workspace_id=xxx&status=scheduled`
- Lists reactivation events with past customer details
- Supports filtering by status and pagination

#### `app/api/reactivation/customers/route.ts`
- **GET** `/api/reactivation/customers?workspace_id=xxx`
- Lists past customers with their reactivation events
- Includes job completion date, roof type, job value

#### `app/api/reactivation/send/route.ts`
- **POST** `/api/reactivation/send`
- Sends a reactivation message for a specific event
- Calls edge function `send-reactivation-message`

#### `app/api/reactivation/generate/route.ts`
- **POST** `/api/reactivation/generate`
- Generates reactivation events for past customers
- Calls database function `generate_reactivation_events`

### 4. Dashboard UI

#### `app/dashboard/reactivation/page.tsx`
- Full-featured dashboard page for reactivation engine
- **KPI Cards:**
  - Past Customers count
  - Events Scheduled
  - Messages Sent
  - Replies Received
  - Estimated Revenue

- **Scheduled Events Table:**
  - Shows all scheduled reactivation events
  - Customer name, event type, scheduled date, status
  - "Send Now" button for scheduled events

- **Past Customers Table:**
  - Lists all past customers from completed jobs
  - Job completion date, roof type, job value
  - Shows associated reactivation events

- **Actions:**
  - "Generate Events" button to create reactivation events
  - "Send Now" button for individual events

## 🎯 Reactivation Windows

The system automatically segments past customers into reactivation windows:

- **3-month follow-up** (0.25 years) → "How is everything? Need gutter cleaning?"
- **1-year check-in** (1.0 years) → "Inspection time. We'll look at seals & flashings."
- **3-year offer** (3.0 years) → "Soft wash, maintenance, tune-up."
- **5-year offer** (5.0 years) → "Maintenance inspection to keep warranties strong."
- **7-year alert** (7.0 years) → "Roof nearing replacement window—free inspection."
- **10-year alert** (10.0+ years) → "Roof entering replacement window—free inspection."

## 🧩 How This Makes Roofers Money

1. **Turns dead customers into live revenue** - Most roofing companies never talk to past customers again. We fix that.

2. **Creates predictable yearly revenue cycles** - Every season = jobs.

3. **Makes contractors look professional** - Right timing = trust.

4. **SmartSend becomes a "revenue robot"** - While the roofer sleeps, old customers wake up.

## 📋 Setup Instructions

### 1. Database Migration

Run the migration in Supabase SQL Editor:

```bash
# File: supabase/migrations/20250303000000_block28412_past_customer_reactivation_engine_v1.sql
```

Or via CLI:
```bash
supabase db push
```

This creates:
- `past_customers` table with RLS policies
- `reactivation_events` table with RLS policies
- Trigger function `log_past_customer()`
- Function `generate_reactivation_events()`
- Function `get_reactivation_stats()`
- All necessary indexes

### 2. Deploy Edge Functions

Deploy the reactivation edge functions:

```bash
cd supabase
supabase functions deploy schedule-reactivation
supabase functions deploy send-reactivation-message
```

### 3. Configure Environment Variables

Ensure these environment variables are set in Supabase Dashboard → Edge Functions → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `VONAGE_SMS_URL` (optional) - Vonage/Nexmo SMS endpoint
- `TWILIO_ACCOUNT_SID` (optional) - Twilio account SID
- `TWILIO_AUTH_TOKEN` (optional) - Twilio auth token
- `TWILIO_PHONE_NUMBER` (optional) - Twilio phone number

### 4. Schedule Reactivation Event Generation

Set up a cron job to run the reactivation event generator periodically (recommended: daily):

In Supabase SQL Editor:
```sql
-- Schedule reactivation event generation to run daily at 2 AM
SELECT cron.schedule(
  'generate-reactivation-events',
  '0 2 * * *', -- Daily at 2 AM
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/schedule-reactivation',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

### 5. Schedule Reactivation Message Sending

Set up a cron job to send scheduled reactivation messages (recommended: every hour):

In Supabase SQL Editor:
```sql
-- Schedule reactivation message sending to run every hour
SELECT cron.schedule(
  'send-reactivation-messages',
  '0 * * * *', -- Every hour
  $$
  DO $$
  DECLARE
    event_record RECORD;
  BEGIN
    -- Get all scheduled events that are due
    FOR event_record IN
      SELECT re.id, re.past_customer_id, pc.email, pc.phone, pc.homeowner_name, re.type
      FROM reactivation_events re
      JOIN past_customers pc ON pc.id = re.past_customer_id
      WHERE re.status = 'scheduled'
        AND re.scheduled_at <= now()
      LIMIT 50
    LOOP
      -- Call send-reactivation-message function
      PERFORM net.http_post(
        url := 'https://YOUR_PROJECT.supabase.co/functions/v1/send-reactivation-message',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
        body := jsonb_build_object(
          'event_id', event_record.id,
          'email', event_record.email,
          'phone', event_record.phone,
          'name', event_record.homeowner_name,
          'type', event_record.type
        )
      );
    END LOOP;
  END $$;
  $$
);
```

## 🎨 Usage

### Access the Dashboard

Navigate to: `/dashboard/reactivation`

### Generate Reactivation Events

1. Click "Generate Events" button
2. System scans all past customers
3. Creates reactivation events based on time windows
4. Events appear in "Scheduled Events" table

### Send Reactivation Messages

1. View scheduled events in the dashboard
2. Click "Send Now" for any scheduled event
3. System sends SMS + Email automatically
4. Event status updates to "sent"

### View Past Customers

1. Navigate to "Past Customers" section
2. See all customers from completed jobs
3. View associated reactivation events
4. Track job completion dates and values

## 📊 Revenue Dashboard

The dashboard shows:
- **Past Customers** - Total count of past customers
- **Events Scheduled** - Number of scheduled reactivation events
- **Messages Sent** - Number of messages successfully sent
- **Replies Received** - Number of customer replies
- **Estimated Revenue** - Total estimated revenue from booked events

## 🔒 Security

- Row Level Security (RLS) enabled on all tables
- Users can only view/reactivation data for their workspace
- Service role can manage all data (for edge functions)
- All API routes require authentication and workspace membership

## 🚀 Next Steps (Future Enhancements)

- Seasonal offer templates (spring gutter cleaning, summer solar inspection, etc.)
- Custom reactivation windows per workspace
- A/B testing for reactivation messages
- Integration with calendar scheduling for inspections
- Automated follow-up sequences for reactivation replies
- Revenue attribution tracking for reactivation campaigns

## 📝 Notes

- Past customers are automatically created when jobs are marked as 'completed'
- Reactivation events are generated based on time since job completion
- Messages are sent via SMS (Vonage/Twilio) and Email
- All events are tracked for revenue attribution
- Dashboard provides real-time statistics and management

---

**Block 28412 Implementation Complete** ✅


































