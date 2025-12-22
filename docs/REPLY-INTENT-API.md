# Reply Intent Detection API

## Overview

The Reply Intent API (`/api/reply-intent`) automatically classifies email reply intent and, when interest is detected, sends an automated email with a Calendly link and ICS calendar attachment.

This directly increases **MB/100 (Meetings Booked per 100 Replies)**, which is our North Star metric.

## Features

- ✅ AI-powered intent classification using GPT-4o-mini
- ✅ Four intent categories: Interested, Not Interested, Out of Office, Follow Up Later
- ✅ Automatic email sending with Calendly link + ICS attachment for "Interested" replies
- ✅ Uses existing `sendMail()` helper for flexible email delivery (SMTP/Resend)
- ✅ Beautiful HTML and plain text email formatting
- ✅ Complete error handling

## API Endpoint

**POST** `/api/reply-intent`

### Request Body

```json
{
  "from": "client@example.com (required)",
  "to": "founder@smartsend.ai (optional)",
  "subject": "Re: Let's talk (optional)",
  "body": "Hey, I'm interested in trying SmartSend AI. When can we meet? (required)"
}
```

### Response

**Intent: Interested (Email Sent)**
```json
{
  "intent": "Interested",
  "status": "email_sent",
  "message": "Meeting invite sent successfully"
}
```

**Other Intents (No Email)**
```json
{
  "intent": "Not Interested"
}
```

**Error:**
```json
{
  "error": "Error message"
}
```

## Environment Variables

Required environment variables:

```bash
# OpenAI API (REQUIRED)
OPENAI_API_KEY=sk-...

# Email Configuration (Choose one: SMTP or Resend)
MAIL_PROVIDER=smtp  # or 'resend'

# If using SMTP (e.g., Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password  # Use Gmail App Password, not login password

# If using Resend
RESEND_API_KEY=re_...

# Meeting Configuration (OPTIONAL - has defaults)
CALENDLY_URL=https://calendly.com/smartsend-ai/demo
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai
MEETING_ORGANIZER_NAME=SmartSend AI
```

### 📧 Gmail App Password Setup

⚠️ **Important**: Use a Gmail App Password, not your login password.

1. Enable 2-Factor Authentication on your Google account
2. Go to: https://myaccount.google.com/apppasswords
3. Select "Mail" and generate a new app password
4. Copy the 16-character password and paste it as `SMTP_PASS`

## Setup

### 1. Set environment variables

Add to your `.env.local`:
```bash
# Required
OPENAI_API_KEY=sk-your_openai_api_key

# Email provider (choose one)
MAIL_PROVIDER=smtp

# SMTP (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# Optional meeting config
CALENDLY_URL=https://calendly.com/smartsend-ai/demo
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai
MEETING_ORGANIZER_NAME=SmartSend AI
```

### 2. Start development server

```bash
npm run dev
```

### 3. Test the endpoint

```bash
# Test with "Interested" intent (will send email)
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Demo",
    "body": "I am interested in learning more"
  }'

# Test with "Out of Office" intent (no email)
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "Auto-Reply",
    "body": "I am currently out of office until next week"
  }'
```

## Integration Examples

### With Inbound Email Handler

```typescript
// In your email webhook handler
async function handleInboundEmail(email: InboundEmail) {
  // Classify reply intent and auto-send meeting invite if interested
  const response = await fetch('/api/reply-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: email.from,
      to: email.to,
      subject: email.subject,
      body: email.text
    })
  });

  const result = await response.json();
  
  if (result.status === 'email_sent') {
    console.log(`✅ Sent meeting invite to ${email.from}`);
    // Track in analytics
    await trackEvent('meeting_invite_sent', { 
      recipient: email.from,
      intent: result.intent 
    });
  } else {
    console.log(`📊 Intent: ${result.intent}`);
    // Store intent for analytics
    await storeReplyIntent(email.from, result.intent);
  }
}
```

### Store Intent in Supabase

```typescript
// Optional: Store intents for analytics
async function storeReplyIntent(email: string, intent: string) {
  await supabase.from('messages').update({
    reply_intent: intent,
    classified_at: new Date().toISOString()
  }).eq('sender_email', email);
}
```

## How It Works

1. **Intent Classification**: GPT-4o-mini analyzes the reply and classifies it into one of four categories:
   - **Interested** - Shows interest in meeting or learning more
   - **Not Interested** - Explicitly declines or unsubscribes
   - **Out of Office** - Auto-reply indicating unavailability
   - **Follow Up Later** - Wants to connect but not immediately

2. **Automatic Action** (only for "Interested"):
   - Creates ICS calendar event for 1 week from now at 2:00 PM (30 min duration)
   - Generates personalized email with Calendly link
   - Attaches ICS file for one-click calendar import
   - Sends email using configured mail provider (SMTP or Resend)

3. **Response**: Returns the classified intent to the caller for analytics tracking

## Email Template (Sent for "Interested")

**Subject:** Let's book a quick SmartSend AI demo 📅

**Body:**
```
Hey [name], thanks for your interest!

You can pick a time here: [Calendly URL]

Or open the attached calendar invite.

Looking forward to connecting!

- [Organizer Name]
```

## Intent Classification Examples

**Interested:**
- "Yes, let's chat next week"
- "I'm interested in learning more"
- "When are you available?"
- "I'd like to schedule a call"
- "Can we set up a meeting?"
- "This looks interesting, let's talk"

**Not Interested:**
- "Please unsubscribe me"
- "Not interested"
- "Remove me from your list"
- "Stop emailing me"
- "Please don't contact me again"

**Out of Office:**
- "I am currently out of office"
- "On vacation until next week"
- "Auto-reply: Out of office"

**Follow Up Later:**
- "Check back with me next month"
- "Not right now, maybe in Q2"
- "Reach out in a few weeks"

## Performance

- **Response Time**: ~1-3 seconds (includes OpenAI + email sending)
- **Cost**: ~$0.0001 per classification (GPT-4o-mini pricing)
- **Accuracy**: High for clear intent signals
- **Email Delivery**: Depends on configured provider (SMTP ~2-5s, Resend ~1-2s)

## Acceptance Criteria

✅ **Returns correct intent value**
- Intent is one of: Interested, Not Interested, Out of Office, Follow Up Later

✅ **Sends email + ICS file if "Interested"**
- Email contains Calendly link
- ICS file is attached for calendar import
- Email is personalized with recipient name

✅ **No crash even on unexpected inputs**
- Handles Out of Office auto-replies
- Handles random/gibberish inputs
- Returns "Unknown" intent if classification fails

## Troubleshooting

**Error: Missing OPENAI_API_KEY**
- Add your OpenAI API key to `.env.local`
- Verify the key starts with `sk-`

**Error: Missing required fields: from, body**
- Ensure request includes both `from` (email address) and `body` (message text)

**Email not sending**
- Check `MAIL_PROVIDER` is set to `smtp` or `resend`
- Verify SMTP credentials if using Gmail (use app password, not login password)
- Check logs for specific email errors

**Wrong intent classification**
- The AI is probabilistic - edge cases may misclassify
- Consider adjusting the prompt in `route.ts` for your specific use case
- Add more examples to the prompt for better accuracy

## Next Steps

🧩 **Hook into your inbox listener**
- Add this API call to `/api/inbox/replies` or your email webhook handler

📊 **Track analytics**
- Add `reply_intent` column to your `messages` table
- Track "Replies → Meetings %" metric

🚀 **Deploy**
- Add required env vars to production (Vercel, Railway, etc.)
- Test with real reply emails

## Related Files

- API Route: `/src/app/api/reply-intent/route.ts`
- ICS Utility: `/lib/ics.ts`
- Mailer Helper: `/lib/mailer.ts`
- Documentation: `/docs/REPLY-INTENT-API.md`
