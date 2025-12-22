# Auto-Meeting Insert + Calendar Invite Feature

## Overview

This feature automatically inserts a Calendly link and attaches an .ics calendar invite when a reply is detected as having positive intent. It connects your reply-intent detector to your meeting conversion system.

## Files Created/Modified

### 1. API Route
**File:** `src/app/api/meetings/auto-insert/route.ts`

Handles the auto-insert logic:
- Validates positive intent
- Fetches sender's Calendly link from profile
- Generates ICS calendar invite
- Sends follow-up email with link + .ics attachment
- Logs meeting in database

### 2. Database Schema
**File:** `supabase/migrations/20250141_add_message_id_to_meetings.sql`

Adds `message_id` field to existing meetings table to link back to original messages.

### 3. Test Script
**File:** `scripts/test-auto-meeting-insert.ts`

Comprehensive test script to validate endpoint functionality.

## Database Schema

The feature uses the existing `meetings` table with an additional `message_id` field:

```sql
-- Meetings table structure
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade, -- NEW
  contact_email text not null,
  thread_id text,
  subject text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('proposed','booked','declined','canceled')) default 'proposed',
  calendly_link text,
  ics text,          -- raw ICS string
  location text default 'Zoom',
  created_at timestamptz not null default now()
);
```

## API Usage

### Endpoint
```
POST /api/meetings/auto-insert
```

### Request Body
```json
{
  "messageId": "uuid-of-original-message",
  "recipientEmail": "prospect@example.com",
  "senderEmail": "you@smartsend.ai",
  "intent": "positive"
}
```

### Response
```json
{
  "success": true
}
```

### Error Responses
```json
// Not positive intent
{
  "skipped": true,
  "reason": "Not positive intent"
}

// Missing meeting link
{
  "error": "Missing meeting link"
}

// Authentication error
{
  "error": "Unauthorized"
}
```

## Prerequisites

### 1. Profile Setup
Users must have a `calendly_url` in their profile:

```sql
-- Add Calendly URL to profiles (already done in migration)
alter table if exists public.profiles
  add column if not exists calendly_url text;
```

### 2. Environment Variables
Ensure these SMTP variables are configured:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`

### 3. Dependencies
The following packages are already installed:
- `nodemailer` - Email sending
- `ical-generator` - ICS file generation
- `@supabase/supabase-js` - Database operations

## Integration with Reply-Intent Detector

To integrate this with your existing reply-intent detector, call the endpoint when positive intent is detected:

```typescript
// Example integration
if (detectedIntent === 'positive') {
  await fetch('/api/meetings/auto-insert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageId: originalMessage.id,
      recipientEmail: reply.from,
      senderEmail: reply.to,
      intent: 'positive'
    })
  });
}
```

## Testing

### 1. Run Test Script
```bash
tsx scripts/test-auto-meeting-insert.ts
```

### 2. Manual Testing
```bash
curl -X POST http://localhost:3000/api/meetings/auto-insert \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "123",
    "recipientEmail": "prospect@example.com",
    "senderEmail": "you@smartsend.ai",
    "intent": "positive"
  }'
```

### 3. Verification Checklist
- ✅ Email sends with .ics attached
- ✅ Record created in meetings table
- ✅ Auto-skip if not positive intent
- ✅ Proper error handling for missing meeting link
- ✅ Authentication validation

## Security Features

### Row-Level Security (RLS)
The meetings table has RLS policies ensuring users can only:
- View their own meetings
- Insert meetings for themselves
- Update their own meetings
- Delete their own meetings

### Authentication
The endpoint requires valid authentication via Supabase auth cookies.

### Input Validation
- Validates intent is "positive"
- Checks for required profile data (calendly_url)
- Sanitizes email addresses

## Error Handling

The endpoint handles various error scenarios:
1. **Authentication failures** - Returns 401 Unauthorized
2. **Missing meeting link** - Returns 400 Bad Request
3. **Non-positive intent** - Returns skipped response
4. **SMTP failures** - Logs error and returns 500
5. **Database errors** - Logs error and returns 500

## Future Enhancements

Potential improvements:
1. **Custom meeting templates** - Allow users to customize email templates
2. **Multiple calendar providers** - Support Calendly, Acuity, etc.
3. **Meeting preferences** - Store user's preferred meeting duration/times
4. **Analytics** - Track meeting conversion rates
5. **Webhook integration** - Update meeting status when booked via Calendly

## Troubleshooting

### Common Issues

1. **"Missing meeting link" error**
   - Ensure user has `calendly_url` set in their profile
   - Check profile data retrieval

2. **Email not sending**
   - Verify SMTP environment variables
   - Check SMTP credentials and host settings

3. **ICS file not attaching**
   - Verify ICS generation is working
   - Check nodemailer attachment configuration

4. **Database insert failing**
   - Check RLS policies
   - Verify user authentication
   - Check required fields are provided

### Debug Mode
Enable debug logging by setting `NODE_ENV=development` to see detailed error messages.