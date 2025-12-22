# Meeting Invite Automation Setup

This guide covers the setup required for the automated meeting invite feature that sends calendar invites (.ics) and Calendly links via email when reply intent is detected.

## 1. Install Dependencies

Add the missing `ical-generator` package:

```bash
npm install ical-generator
# or
yarn add ical-generator
# or
pnpm add ical-generator
```

**Note:** `resend` is already installed in this project.

## 2. Environment Variables

Add the following to your `.env.local` file:

```bash
# Supabase (likely already configured)
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Resend (email service)
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM="SmartSend AI <noreply@yourdomain.com>"
```

### Getting Your Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Verify your sending domain
3. Generate an API key from your dashboard
4. Add it to your `.env.local`

## 3. Database Migration

Run this SQL in your Supabase SQL Editor to add the necessary columns to the `meetings` table:

```sql
-- meetings: add lead email + invite send metadata
ALTER TABLE meetings 
  ADD COLUMN IF NOT EXISTS lead_email TEXT,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS invite_message_id TEXT,
  ADD COLUMN IF NOT EXISTS invite_status TEXT CHECK (invite_status IN ('pending','sent','failed')) DEFAULT 'pending';

-- small helper index
CREATE INDEX IF NOT EXISTS idx_meetings_message ON meetings(message_id);
```

## 4. Files Created

The following files have been created/updated:

- ✅ `/src/lib/email/sendInvite.ts` - Email utility for sending invites via Resend
- ✅ `/src/lib/email/templates/MeetingInvite.ts` - HTML template for meeting invites
- ✅ `/src/app/api/reply-intent/route.ts` - Updated with email sending logic
- ✅ `/src/lib/client/sendMeetingFromReply.ts` - Optional client helper

## 5. Testing

### Manual API Test

```bash
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_123",
    "senderEmail": "founder@smartsend.ai",
    "leadEmail": "prospect@example.com",
    "leadFirstName": "Taylor",
    "subject": "Re: Quick call?",
    "body": "Yes let'\''s schedule a quick call this week."
  }'
```

**Expected Response:**

```json
{
  "intent": "meeting",
  "calendlyLink": "https://calendly.com/your-handle/15min",
  "message": "Meeting intent detected. Invite sent."
}
```

### Idempotency Test

Re-run the same curl command. You should get:

```json
{
  "intent": "meeting",
  "message": "Invite already sent for this message.",
  "calendlyLink": "https://calendly.com/your-handle/15min"
}
```

## 6. Acceptance Checklist

- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] `ical-generator` package installed
- [ ] Test email sent successfully
- [ ] Meeting row in database has:
  - `lead_email` populated
  - `invite_status` = 'sent'
  - `invite_sent_at` timestamp
  - `invite_message_id` from Resend
- [ ] Idempotency works (duplicate requests don't send twice)
- [ ] Email contains:
  - Attached .ics file
  - Calendly link in HTML body
  - Personalized greeting (if firstName provided)

## 7. How It Works

1. **Intent Detection**: The API checks for meeting-related keywords in the reply body
2. **Idempotency Guard**: Checks if an invite was already sent for this `messageId`
3. **Calendar File**: Generates a .ics file with meeting details
4. **Email Send**: Sends email via Resend with .ics attachment + Calendly link
5. **DB Logging**: Records sent status, provider message ID, and timestamps
6. **Error Handling**: Logs failure status if email send fails

## 8. Next Steps

### Recommended Enhancements:

1. **Reply-Intent v2**: Upgrade from regex to LLM-based classification
   - Use OpenAI/Anthropic for better intent detection
   - Add confidence scoring
   - Implement allowlist/denylist for edge cases

2. **Analytics Dashboard**: Track meeting conversion metrics
   - Meetings booked per 100 replies (MB/100)
   - Reply → meeting conversion rate
   - Sender health scores

3. **A/B Testing**: Test different timing and templates
   - Immediate send vs. delayed send
   - Different email templates
   - Subject line variations

## Troubleshooting

### Email not sending?
- Check `RESEND_API_KEY` is valid
- Verify domain is verified in Resend dashboard
- Check server logs for error messages

### Database errors?
- Ensure migration was applied successfully
- Check that `meetings` table exists
- Verify `message_id` has unique constraint if using upsert

### No meeting intent detected?
- Current regex: `/schedule|meet|call|chat|connect/i`
- Body text must contain one of these keywords
- Consider upgrading to LLM-based detection for better accuracy
