# Auto Meeting Scheduling Implementation

## Overview
Automated meeting scheduling system that detects positive reply intent and automatically sends calendar invites with Calendly links to prospects. This reduces drop-off and creates a "one-click accept" path for scheduling meetings.

## Features
- **Intent Classification**: Automatically classifies inbound replies as positive, neutral, or negative
- **Auto-Scheduling**: Creates tentative meeting slots for positive replies
- **Calendar Invites**: Sends ICS files as email attachments
- **Calendly Integration**: Includes personalized Calendly links for easy rescheduling
- **Timezone Support**: Configurable timezone preferences per profile
- **Database Tracking**: Links meetings back to campaigns and messages for analytics

## Files Created

### Database Migration
- **File**: `/supabase/migrations/20251008_auto_meetings.sql`
- **Purpose**: Adds meeting settings to profiles, creates meetings table, adds reply tracking to messages
- **Features**: Idempotent migration, RLS policies, helpful indexes

### Core Utilities
1. **ICS Builder** (`/lib/ics.ts`)
   - Generates RFC-compliant ICS calendar files
   - Supports event details, organizer, attendees, location
   - Properly escapes special characters

2. **Mailer** (`/lib/mailer.ts` & `/lib/mailerTypes.ts`)
   - Supports both Resend and SMTP providers
   - Configurable via `MAIL_PROVIDER` environment variable
   - Handles email attachments (ICS files)

### API Endpoints
1. **Reply Webhook** (`/src/app/api/replies/webhook/route.ts`)
   - Receives inbound reply data
   - Classifies intent using keyword matching
   - Creates meeting records for positive replies
   - Sends calendar invites with Calendly links
   - Updates message records with reply tracking

2. **Meeting Settings API** (`/src/app/api/settings/meetings/route.ts`)
   - GET: Retrieves user's Calendly URL and timezone
   - POST: Updates meeting preferences

### UI Components
- **Settings Page** (`/src/app/(dashboard)/settings/meetings/page.tsx`)
  - Configure Calendly URL
  - Set timezone preference
  - Simple, user-friendly interface

## Environment Variables

Required variables (add to `.env.local`):

```bash
# Mail Provider (choose one)
MAIL_PROVIDER=smtp  # or 'resend'

# For SMTP
SMTP_HOST=smtp.yourhost.com
SMTP_PORT=587
SMTP_USER=postmaster@yourdomain.com
SMTP_PASS=changeme

# For Resend
RESEND_API_KEY=re_your_api_key_here

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Setup Instructions

### 1. Apply Database Migration
```bash
cd supabase
supabase db push
# Or if using remote Supabase:
supabase db push --linked
```

### 2. Install Dependencies
```bash
pnpm install nodemailer
pnpm install -D @types/nodemailer
# Optional: if using Resend
pnpm install resend
```

### 3. Configure Environment Variables
Copy the variables from `env.template` to your `.env.local` and fill in your values.

### 4. Start Development Server
```bash
pnpm dev
```

### 5. Configure Meeting Settings
1. Navigate to `/settings/meetings`
2. Enter your Calendly URL (e.g., `https://calendly.com/your-handle/intro`)
3. Set your timezone (e.g., `America/Los_Angeles`)
4. Click Save

## Usage

### Testing the Webhook

Simulate a positive reply:

```bash
curl -X POST http://localhost:3000/api/replies/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "YOUR_PROFILE_ID",
    "from_email": "prospect@example.com",
    "to_email": "you@yourdomain.com",
    "sender_id": "YOUR_SENDER_ID",
    "campaign_id": "YOUR_CAMPAIGN_ID",
    "subject": "Re: Quick question",
    "body_text": "Yes, let'\''s schedule something this week."
  }'
```

### Expected Behavior

1. **Positive Reply**: System creates meeting, sends calendar invite with Calendly link
2. **Neutral Reply**: Updates message with reply tracking, no meeting created
3. **Negative Reply**: Updates message with reply tracking, no meeting created

## Intent Classification

The system uses keyword-based classification (can be enhanced with LLM later):

**Positive Keywords**: yes, let's talk, schedule, book, call, meeting, interested, chat, time, available

**Negative Keywords**: no, unsubscribe, stop, not interested, remove, busy, later

## Database Schema

### Profiles Table (new columns)
```sql
calendly_url text          -- User's Calendly scheduling link
timezone text              -- User's preferred timezone (default: America/Los_Angeles)
```

### Meetings Table (new)
```sql
id uuid                    -- Primary key
profile_id uuid            -- Foreign key to profiles
campaign_id uuid           -- Foreign key to campaigns (nullable)
message_id uuid            -- Foreign key to messages (nullable)
attendee_email text        -- Prospect's email
source text                -- 'reply_intent' (default)
status text                -- 'scheduled', 'completed', 'cancelled'
scheduled_at timestamptz   -- Meeting time
created_at timestamptz     -- Record creation time
```

### Messages Table (new columns)
```sql
replied_at timestamptz     -- When reply was received
reply_intent text          -- 'positive' | 'neutral' | 'negative'
meeting_id uuid            -- Foreign key to meetings (nullable)
```

## Integration Points

### Inbound Email Provider
Wire your email provider's inbound webhook to `/api/replies/webhook`:
- **Mailgun**: Inbound Routes → Forward to webhook
- **SendGrid**: Inbound Parse → Configure endpoint
- **Custom**: Map provider payload to expected format

### Expected Webhook Payload
```typescript
{
  profile_id: string        // Required: SmartSend user ID
  from_email: string        // Required: Prospect email
  to_email: string          // Required: Your inbox
  sender_id?: string        // Optional: Sender record ID
  campaign_id?: string      // Optional: Campaign ID
  message_id?: string       // Optional: Original message ID
  subject?: string          // Optional: Email subject
  body_text?: string        // Optional: Plain text body
  body_html?: string        // Optional: HTML body
  received_at?: string      // Optional: Receipt timestamp
}
```

## Analytics Integration

Meetings are tracked with references to:
- **Profile**: Who owns the meeting
- **Campaign**: Which campaign generated it
- **Message**: Which specific message led to the reply
- **Source**: How the meeting was created ('reply_intent')

This enables analytics queries like:
- Meetings booked per campaign
- Reply-to-meeting conversion rate
- Top-performing campaigns by meetings

## Future Enhancements

### Near-term
1. **Provider-specific webhook handlers**: Pre-built adapters for Mailgun, SendGrid, etc.
2. **Smart timezone detection**: Infer timezone from prospect's domain or email headers
3. **LLM-based intent**: Use OpenAI for more accurate intent classification
4. **Calendar API integration**: Direct Google Calendar/Outlook sync

### Long-term
1. **Meeting source routing**: Tag meetings by campaign for leaderboard analytics
2. **Auto-followup**: Send reminder emails before meetings
3. **Meeting notes**: Capture meeting outcomes and next steps
4. **CRM sync**: Push meetings to Salesforce, HubSpot, etc.

## Security Considerations

1. **RLS Policies**: Meetings table has Row Level Security enabled
2. **Service Role**: Uses Supabase admin client for server-side operations
3. **Email Validation**: Lowercases and validates email addresses
4. **Profile Verification**: Verifies profile exists before creating meetings

## Monitoring

Key metrics to track:
- Reply intent distribution (positive/neutral/negative)
- Meetings created per day
- Email delivery success rate
- Calendar invite acceptance rate

## Troubleshooting

### Emails not sending
- Check `MAIL_PROVIDER` environment variable
- Verify SMTP credentials or Resend API key
- Check server logs for detailed error messages

### Intent misclassification
- Review keyword lists in `classifyIntent()` function
- Consider implementing LLM-based classification
- Add logging to track classification decisions

### Meetings not appearing
- Verify database migration ran successfully
- Check RLS policies allow user access
- Confirm profile_id is valid

### Timezone issues
- Default is UTC-based scheduling (MVP)
- Set timezone in settings page
- Future: implement proper timezone conversion

## Support

For issues or questions:
1. Check implementation logs in server console
2. Review database records in Supabase dashboard
3. Test webhook with curl commands
4. Verify environment variables are set correctly

---

**What This Unlocks for MB/100**
- Converts positive replies → meetings automatically (reduces drop-off)
- Calendly link + ICS attachment creates "one-click accept" path
- Settings let you standardize scheduling across all campaigns/senders
- Analytics integration for campaign performance tracking
