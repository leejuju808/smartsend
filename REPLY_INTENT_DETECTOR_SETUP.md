# Reply-Intent Detector + Auto-Calendar Insert Setup Guide

## Overview

This feature automatically detects positive meeting intent from email replies and creates calendar invitations with Calendly booking links. It's the wedge that drives meeting bookings!

## What It Does

1. **Receives inbound email replies** via webhook or SMTP parser
2. **Analyzes intent** using OpenAI GPT-4o-mini to classify as:
   - `positive_meeting_intent` - Prospect wants to meet
   - `neutral` - Non-committal response
   - `negative` - Not interested
3. **Auto-creates meetings** for positive responses:
   - Generates `.ics` calendar file
   - Returns Calendly booking link
   - Stores meeting in database
4. **Tracks all replies** in `ai_reply_events` table for analytics

## Architecture

```
Email Reply → Webhook/Parser → Edge Function → OpenAI Classification
                                      ↓
                            Positive Intent?
                                      ↓
                    ┌─────────────────┴─────────────────┐
                   Yes                                  No
                    ↓                                    ↓
          Create ICS + Meeting Record           Log Event Only
          Return Calendly Link
```

## Files Created

- `/supabase/functions/reply-intent-detector/index.ts` - Edge function
- `/supabase/functions/reply-intent-detector/deno.json` - Deno config
- `/supabase/migrations/20251015_ensure_reply_intent_columns.sql` - Database schema

## Database Tables Used

### `meetings` Table
Already exists from migration `20250140_create_meetings_table.sql`

Stores proposed and booked meetings:
```sql
- id (uuid)
- user_id (uuid) - Owner of the meeting
- contact_email (text) - Prospect's email
- thread_id (text) - Email thread identifier
- subject (text)
- start_at (timestamptz) - Proposed meeting start
- end_at (timestamptz) - Proposed meeting end
- status (text) - proposed, booked, declined, canceled
- calendly_link (text) - Booking URL
- ics (text) - ICS file content
- location (text) - Meeting location/URL
- created_at (timestamptz)
```

### `ai_reply_events` Table
Tracks all reply classifications for analytics:
```sql
- user_id (uuid)
- contact_email (text)
- intent_label (text) - Classification result
- confidence (numeric) - AI confidence score
- action_taken (text) - Action performed
- metadata (jsonb) - Additional context
- created_at (timestamptz)
```

### `profiles` Table
Stores user's Calendly URL:
```sql
- calendly_url (text) - User's personal booking link
```

## Environment Variables Required

All of these should already be in your `.env.local`:

```bash
# OpenAI (Required)
OPENAI_API_KEY=sk-your_openai_api_key

# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Fallback Calendly URL (Optional)
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/YOUR_HANDLE/intro-call-30
```

## Deployment

### 1. Run Migration

```bash
# Apply the database migration
supabase db push

# Or run migration directly
psql $DATABASE_URL -f supabase/migrations/20251015_ensure_reply_intent_columns.sql
```

### 2. Deploy Edge Function

```bash
# Deploy to Supabase
supabase functions deploy reply-intent-detector

# With project ref
supabase functions deploy reply-intent-detector --project-ref your-project-ref
```

### 3. Set Environment Secrets

```bash
# Set OpenAI API key
supabase secrets set OPENAI_API_KEY=sk-your_key

# Verify secrets are set
supabase secrets list
```

## Local Development

### 1. Start Supabase Locally

```bash
# Start local Supabase
supabase start

# Serve the function locally
supabase functions serve reply-intent-detector
```

### 2. Test with cURL

```bash
# Test positive intent
curl -X POST http://localhost:54321/functions/v1/reply-intent-detector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "messageId": "test-123",
    "sender": "lead@example.com",
    "subject": "Re: Partnership Opportunity",
    "bodyText": "Sure, I would love to schedule a call this week!",
    "userId": "your-user-uuid",
    "threadId": "thread-456"
  }'

# Test neutral intent
curl -X POST http://localhost:54321/functions/v1/reply-intent-detector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "messageId": "test-124",
    "sender": "prospect@company.com",
    "subject": "Re: Product Demo",
    "bodyText": "I will get back to you next month.",
    "userId": "your-user-uuid"
  }'

# Test negative intent
curl -X POST http://localhost:54321/functions/v1/reply-intent-detector \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "messageId": "test-125",
    "sender": "notinterested@example.com",
    "subject": "Re: Meeting Request",
    "bodyText": "Not interested, please remove me from your list.",
    "userId": "your-user-uuid"
  }'
```

## Expected Responses

### Positive Intent Response
```json
{
  "status": "booked",
  "intent": "positive_meeting_intent",
  "calendly_link": "https://calendly.com/YOUR_HANDLE/intro-call-30",
  "meeting_id": "uuid-of-created-meeting",
  "ics_content": "BEGIN:VCALENDAR\nVERSION:2.0\n..."
}
```

### Neutral/Negative Response
```json
{
  "status": "neutral",
  "intent": "neutral",
  "action": "no_meeting_needed"
}
```

### Error Response
```json
{
  "error": "Missing required fields: sender, bodyText"
}
```

## Integration with Email Webhooks

### Mailgun Webhook Integration

Add to your Mailgun route handler:

```typescript
// app/api/webhooks/mailgun/route.ts
export async function POST(req: Request) {
  // ... verify signature ...
  
  const formData = await req.formData();
  const sender = formData.get('sender');
  const subject = formData.get('subject');
  const bodyText = formData.get('body-plain');
  const messageId = formData.get('Message-Id');
  
  // Call reply-intent-detector
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-intent-detector`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        messageId,
        sender,
        subject,
        bodyText,
        userId: getUserIdFromEmail(sender),
        threadId: extractThreadId(messageId)
      })
    }
  );
  
  const result = await response.json();
  
  if (result.status === 'booked') {
    // Send email with ICS attachment and Calendly link
    await sendMeetingInvite(sender, result);
  }
  
  return NextResponse.json({ success: true });
}
```

### SendGrid Webhook Integration

```typescript
// app/api/webhooks/sendgrid/route.ts
export async function POST(req: Request) {
  const payload = await req.json();
  
  for (const email of payload) {
    if (email.from && email.text) {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-intent-detector`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({
            messageId: email.headers['Message-ID'],
            sender: email.from,
            subject: email.subject,
            bodyText: email.text,
            userId: findUserByEmail(email.to)
          })
        }
      );
      
      // Handle response...
    }
  }
}
```

## User Profile Setup

Users should set their Calendly URL in their profile:

```typescript
// Update user's Calendly link
await supabase
  .from('profiles')
  .update({ calendly_url: 'https://calendly.com/username/30min' })
  .eq('id', userId);
```

Or provide a UI in your settings page:

```tsx
// app/settings/page.tsx
<Input
  type="url"
  placeholder="https://calendly.com/your-username/30min"
  value={calendlyUrl}
  onChange={(e) => setCalendlyUrl(e.target.value)}
/>
```

## Monitoring & Analytics

### Check Reply Classifications

```sql
-- View recent reply intent classifications
SELECT 
  contact_email,
  intent_label,
  confidence,
  action_taken,
  created_at
FROM ai_reply_events
WHERE intent_label IS NOT NULL
ORDER BY created_at DESC
LIMIT 50;
```

### Meeting Conversion Rate

```sql
-- Calculate meeting booking rate
SELECT 
  COUNT(*) FILTER (WHERE intent_label = 'positive_meeting_intent') as positive_replies,
  COUNT(*) FILTER (WHERE action_taken = 'meeting_proposed') as meetings_created,
  COUNT(*) as total_replies,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE action_taken = 'meeting_proposed') / 
    NULLIF(COUNT(*), 0), 
    2
  ) as conversion_rate
FROM ai_reply_events
WHERE created_at > NOW() - INTERVAL '30 days';
```

### Active Meetings Dashboard

```sql
-- View proposed meetings awaiting booking
SELECT 
  contact_email,
  subject,
  start_at,
  calendly_link,
  created_at
FROM meetings
WHERE status = 'proposed'
ORDER BY created_at DESC;
```

## Troubleshooting

### Function Logs

```bash
# View real-time logs
supabase functions logs reply-intent-detector --tail

# View recent logs
supabase functions logs reply-intent-detector
```

### Common Issues

1. **"Missing OPENAI_API_KEY"**
   - Set secret: `supabase secrets set OPENAI_API_KEY=sk-your-key`

2. **"Permission denied for table meetings"**
   - Using service role key, not anon key
   - Check RLS policies

3. **"intent_label column does not exist"**
   - Run migration: `supabase db push`

4. **No Calendly link returned**
   - Set fallback: `NEXT_PUBLIC_CALENDLY_URL`
   - Update user profile with `calendly_url`

## Cost Estimation

### OpenAI API Costs (GPT-4o-mini)
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens
- Average email: ~200 tokens
- **~$0.0002 per classification** (very affordable!)

### Example Monthly Costs
- 1,000 replies/month: ~$0.20
- 10,000 replies/month: ~$2.00
- 100,000 replies/month: ~$20.00

## Next Steps

1. ✅ Deploy edge function
2. ✅ Set up webhook integration
3. 🔄 Add email sending with ICS attachments
4. 🔄 Build meeting dashboard UI
5. 🔄 Add follow-up automation for non-responses
6. 🔄 Integrate with calendar sync (Google, Outlook)

## Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [ICS Format Specification](https://icalendar.org/)
- [Calendly API Docs](https://developer.calendly.com/)

---

**Questions?** Check existing implementations in:
- `/src/lib/meeting-intent.ts` - Client-side intent helpers
- `/src/lib/meetings/ics.ts` - ICS file generation
- `/src/app/meetings/page.tsx` - Meetings dashboard UI
