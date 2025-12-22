# Inbound Reply Parser — Setup Guide

🎯 **North Star Impact**: Automatically converts positive email replies → scheduled meetings with calendar invites

## What This Does

When prospects reply to your emails:
1. **Parses** inbound webhooks from Mailgun or SendGrid
2. **Matches** replies to original sent messages via message-id headers
3. **Classifies** intent: positive (wants meeting), negative (unsubscribe/not interested), neutral
4. **Auto-schedules** meetings for positive replies
5. **Sends** calendar invite (ICS) + Calendly link back to prospect

## Files Created

### Database
- `supabase/migrations/20251009_inbound_replies.sql` - Creates `inbound_emails` table and adds `inbound_id` to messages

### Backend Logic
- `src/lib/reply_intent.ts` - Core intent classification and meeting automation logic

### API Routes
- `src/app/api/replies/webhook/route.ts` - Generic webhook handler (backward compatible)
- `src/app/api/replies/[provider]/route.ts` - Provider-specific webhooks with signature verification

## Setup Steps

### 1. Run Database Migration

```bash
cd /Users/juju/smartsend-ai
supabase db push
```

This creates:
- `inbound_emails` table with RLS policies
- Indexes for fast lookups by message_id, from_email, in_reply_to
- `inbound_id` column on `messages` table

### 2. Configure Environment Variables

Add to your `.env.local`:

```bash
# Mailgun inbound signature verification
MAILGUN_SIGNING_KEY=your_mailgun_signing_key_here

# SendGrid Inbound Parse basic auth
SENDGRID_BASIC_USER=webhook
SENDGRID_BASIC_PASS=supersecretpassword
```

**Where to find these:**
- **Mailgun**: Dashboard → Security → HTTP webhook signing key
- **SendGrid**: You create these - they're for basic auth on your webhook endpoint

### 3. Configure Provider Webhooks

#### Mailgun Setup

1. Go to Mailgun → Sending → Routes
2. Create a new route:
   - **Priority**: 1
   - **Filter Expression**: `match_recipient(".*@yourdomain.com")`
   - **Actions**: 
     - Forward to URL: `https://yourdomain.com/api/replies/mailgun`
     - **Important**: Add custom header `X-SS-Profile: YOUR_PROFILE_UUID`
3. Save and test

#### SendGrid Setup

1. Go to SendGrid → Settings → Inbound Parse
2. Add new host & URL:
   - **Subdomain**: `replies` (creates replies.yourdomain.com)
   - **Destination URL**: `https://yourdomain.com/api/replies/sendgrid`
   - **Check spam**: Yes (recommended)
   - Configure basic auth with `SENDGRID_BASIC_USER` and `SENDGRID_BASIC_PASS`
3. Update your DNS with the MX record SendGrid provides
4. **Important**: Include `X-SS-Profile` header in outbound emails or use route-specific mapping

### 4. Test Locally

#### Test Mailgun Webhook (Simulate)

```bash
curl -X POST http://localhost:3000/api/replies/mailgun \
  -F profile_id=YOUR_PROFILE_UUID \
  -F sender='prospect@example.com' \
  -F recipient='you@yourdomain.com' \
  -F subject='Re: quick question' \
  -F body-plain='Yes let's schedule this week.' \
  -F 'In-Reply-To=<original-message-id@yourdomain>' \
  -F timestamp=$(date +%s) \
  -F token=random123
```

#### Test SendGrid Webhook (Simulate)

```bash
curl -X POST http://localhost:3000/api/replies/sendgrid \
  -H "Authorization: Basic $(printf 'webhook:supersecret' | base64)" \
  -F profile_id=YOUR_PROFILE_UUID \
  -F from='prospect@example.com' \
  -F to='you@yourdomain.com' \
  -F subject='Re: hello' \
  -F text='Sounds good — book time?' \
  -F headers=$'Message-ID: <abc@sg>\nIn-Reply-To: <original-message-id@yourdomain>'
```

### 5. Verify End-to-End

✅ **Check these after testing:**

1. Row appears in `inbound_emails` table:
   - `provider` set correctly
   - `from_email`, `to_email`, `body_text` populated
   - `handled = true`
   - `handler_note` shows intent or meeting ID

2. Original message updated in `messages` table:
   - `replied_at` timestamp set
   - `reply_intent` = 'positive' | 'negative' | 'neutral'
   - `meeting_id` set (for positive replies)
   - `inbound_id` links to inbound_emails row

3. New meeting created in `meetings` table:
   - `source = 'reply_intent'`
   - `status = 'scheduled'`
   - `scheduled_at` set to next business day 10 AM PT
   - `attendee_email` matches reply sender

4. Email sent to prospect:
   - Subject: "Let's talk — calendar invite attached"
   - Contains meeting.ics attachment
   - Includes Calendly link (if profile.calendly_url set)
   - Shows tentative time

## How It Works

### Intent Classification

Simple keyword matching in `classifyIntent()`:

- **Positive**: yes, schedule, book, let's talk, call, meeting, chat, available, sounds good, interested, works, time
- **Negative**: no, unsubscribe, stop, not interested, remove, opt out, later, busy, do not contact
- **Neutral**: Everything else

### Message Matching Strategy

1. **Try In-Reply-To/References headers** → lookup `provider_message_id`
2. **Try provider Message-Id** → direct match
3. **Fallback**: Last message sent to this `from_email`

This handles different provider quirks and ensures high match rate.

### Meeting Automation

For positive replies:
1. Creates meeting with `scheduled_at = tomorrow 10 AM PT` (30 min)
2. Generates ICS calendar invite
3. Sends email with:
   - ICS attachment
   - Calendly link (if available)
   - Friendly confirmation message
4. Updates original message with `meeting_id`

## Security

### Mailgun
- **Signature verification** using HMAC-SHA256
- Validates timestamp + token against `MAILGUN_SIGNING_KEY`
- Rejects invalid signatures with 401

### SendGrid
- **HTTP Basic Auth** on webhook endpoint
- Validates Authorization header
- Rejects unauthorized requests with 401

### General
- All `inbound_emails` have RLS policy (only visible to profile owner)
- Raw payloads sanitized (removes attachments/content blobs)
- SQL injection prevented via parameterized queries

## Monitoring

```sql
-- View recent inbound emails
select 
  provider,
  from_email,
  subject,
  handler_note,
  received_at
from inbound_emails
where profile_id = 'YOUR_PROFILE_UUID'
order by received_at desc
limit 20;

-- Positive replies that created meetings
select 
  ie.from_email,
  ie.body_text,
  m.scheduled_at,
  m.status
from inbound_emails ie
join messages msg on msg.inbound_id = ie.id
join meetings m on m.id = msg.meeting_id
where ie.profile_id = 'YOUR_PROFILE_UUID'
  and ie.handler_note like 'positive%'
order by ie.received_at desc;
```

## Troubleshooting

### Issue: Replies not matching original messages

**Cause**: Message-ID headers not being stored or forwarded

**Fix**: 
1. Ensure your sending provider stores `provider_message_id` in messages table
2. Check that webhook includes `In-Reply-To` or `References` headers
3. Fallback to email-based matching should still work

### Issue: No calendar invite received

**Cause**: Mailer configuration or ICS generation issue

**Fix**:
1. Check `MAIL_PROVIDER` env var is set correctly
2. Verify SMTP/Resend credentials
3. Check `buildICS()` function in `/lib/ics.ts`
4. Look for errors in inbound_emails.handler_note

### Issue: Wrong intent classification

**Cause**: Simple keyword matching may miss nuanced replies

**Fix**:
1. Add more keywords to `classifyIntent()` function
2. Enable LLM-assisted intent with `REPLY_INTENT_USE_LLM=1` and `OPENAI_API_KEY`
3. Review false positives/negatives and update keyword lists

### Issue: Webhook signature verification fails

**Cause**: Wrong signing key or timestamp issues

**Fix**:
1. Verify `MAILGUN_SIGNING_KEY` matches Mailgun dashboard
2. For SendGrid, check basic auth credentials match exactly
3. Test without verification first (comment out check temporarily)
4. Check server time sync if timestamp validation fails

## Next Steps

1. **Deploy to production** - Update webhook URLs in provider dashboards
2. **Monitor performance** - Watch match rates and intent accuracy
3. **Tune keywords** - Adjust positive/negative lists based on real replies
4. **Add LLM intent** - For better classification at scale
5. **Dashboard** - Build UI to view recent inbound emails and meetings

## MB/100 Impact

This directly drives your North Star ($1M ARR → MB/100):

- **Automates** reply → meeting conversion (zero manual work)
- **Increases** meeting booking rate (instant response)
- **Tracks** full funnel: sent → opened → replied → meeting
- **Scales** without human intervention

Every positive reply becomes a booked meeting automatically. 🚀
