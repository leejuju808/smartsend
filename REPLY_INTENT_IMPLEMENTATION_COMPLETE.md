# ✅ Reply-Intent Detector + Auto Calendar Insert - IMPLEMENTATION COMPLETE

## 🎯 Goal
When a reply is detected in the connected inbox, SmartSend AI classifies the reply intent and automatically inserts a Calendly link + ICS meeting attachment if the intent is "Interested."

**This directly increases MB/100 (Meetings Booked per 100 Replies), which is our North Star metric.**

---

## ✅ What Was Implemented

### 1. API Route: `/src/app/api/reply-intent/route.ts`

**Features:**
- ✅ OpenAI GPT-4o-mini intent classification
- ✅ Four intent categories: `Interested`, `Not Interested`, `Out of Office`, `Follow Up Later`
- ✅ Automatic email sending with Calendly link + ICS attachment for "Interested" replies
- ✅ Uses existing `buildICS()` utility from `/lib/ics.ts`
- ✅ Uses existing `sendMail()` helper from `/lib/mailer.ts` for flexible email delivery
- ✅ Complete error handling and validation

**Request Format:**
```json
{
  "from": "client@example.com",
  "to": "founder@smartsend.ai",
  "subject": "Re: Demo Request",
  "body": "I'm interested in learning more"
}
```

**Response Format:**
```json
{
  "intent": "Interested",
  "status": "email_sent",
  "message": "Meeting invite sent successfully"
}
```

### 2. Email Automation

When intent is "Interested":
1. Creates ICS calendar event (1 week from now, 2:00 PM, 30 min duration)
2. Generates personalized email with:
   - Calendly booking link
   - Attached ICS file for one-click calendar import
   - HTML and plain text versions
3. Sends via configured provider (SMTP or Resend)

**Email Template:**
```
Subject: Let's book a quick SmartSend AI demo 📅

Hey [name], thanks for your interest!

You can pick a time here: [Calendly URL]

Or open the attached calendar invite.

Looking forward to connecting!

- [Organizer Name]
```

### 3. Documentation

Created/updated:
- ✅ `/docs/REPLY-INTENT-API.md` - Complete API documentation
- ✅ `/REPLY_INTENT_ENV_SETUP.md` - Environment variable setup guide
- ✅ `/REPLY_INTENT_IMPLEMENTATION_COMPLETE.md` - This summary

### 4. Test Script

Updated `/scripts/test-reply-intent.sh` with comprehensive tests:
- Test 1: "Interested" intent (sends email)
- Test 2: "Not Interested" intent
- Test 3: "Out of Office" intent
- Test 4: "Follow Up Later" intent
- Test 5: Another "Interested" variation
- Test 6: Error handling (missing fields)

---

## 🔧 Environment Variables

### Required

```bash
# OpenAI API
OPENAI_API_KEY=sk-your_openai_api_key
```

### Email Provider (Choose One)

**Option 1: SMTP (Gmail)**
```bash
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password  # Use App Password, not login password
```

**Option 2: Resend**
```bash
MAIL_PROVIDER=resend
RESEND_API_KEY=re_your_resend_api_key
```

### Optional (Has Defaults)

```bash
CALENDLY_URL=https://calendly.com/smartsend-ai/demo
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai
MEETING_ORGANIZER_NAME=SmartSend AI
```

---

## 🧪 Testing

### Run the test script:

```bash
# Make executable (if needed)
chmod +x scripts/test-reply-intent.sh

# Run tests
./scripts/test-reply-intent.sh
```

### Manual test with curl:

```bash
# Start dev server
npm run dev

# Test "Interested" intent (will send email)
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "to": "founder@smartsend.ai",
    "subject": "Demo",
    "body": "I am interested in learning more"
  }'
```

---

## ✅ Acceptance Criteria

### 1. Returns correct intent value ✓
- Intent is one of: `Interested`, `Not Interested`, `Out of Office`, `Follow Up Later`
- Returns `Unknown` if classification fails

### 2. Sends email + ICS file if "Interested" ✓
- Email contains Calendly link
- ICS file is attached for calendar import
- Email is personalized with recipient name from email address

### 3. No crash on unexpected inputs ✓
- Handles Out of Office auto-replies
- Handles random/gibberish inputs
- Returns proper error for missing required fields

---

## 📊 Integration Example

### Hook into your inbox listener:

```typescript
// In your email webhook handler (e.g., /api/inbox/webhook/route.ts)
async function handleInboundEmail(email: InboundEmail) {
  // Classify reply intent and auto-send if interested
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
    await supabase.from('messages').update({
      reply_intent: result.intent,
      meeting_invite_sent: true,
      classified_at: new Date().toISOString()
    }).eq('sender_email', email.from);
  }
}
```

---

## 🚀 Next Steps

### 1. Add to messages table (optional):
```sql
ALTER TABLE messages ADD COLUMN reply_intent TEXT;
ALTER TABLE messages ADD COLUMN meeting_invite_sent BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN classified_at TIMESTAMPTZ;
```

### 2. Track MB/100 metric:
```sql
SELECT 
  COUNT(*) FILTER (WHERE reply_intent = 'Interested') as interested_replies,
  COUNT(*) FILTER (WHERE meeting_invite_sent = true) as invites_sent,
  COUNT(*) as total_replies,
  ROUND(
    (COUNT(*) FILTER (WHERE meeting_invite_sent = true)::decimal / 
     NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as mb_per_100_replies
FROM messages
WHERE direction = 'inbound'
  AND created_at >= NOW() - INTERVAL '30 days';
```

### 3. Deploy:
- Add required env vars to production (Vercel/Railway/etc.)
- Test with real reply emails
- Monitor email delivery and intent classification accuracy

---

## 📁 Files Modified/Created

### Modified:
- `/src/app/api/reply-intent/route.ts` - Updated with new implementation
- `/docs/REPLY-INTENT-API.md` - Updated documentation
- `/scripts/test-reply-intent.sh` - Updated test script

### Created:
- `/REPLY_INTENT_ENV_SETUP.md` - Environment setup guide
- `/REPLY_INTENT_IMPLEMENTATION_COMPLETE.md` - This summary

### Dependencies Used (Already in package.json):
- `openai` - For GPT-4o-mini intent classification
- `nodemailer` - For email sending via SMTP
- Existing utilities: `/lib/ics.ts`, `/lib/mailer.ts`

---

## 🎉 Implementation Complete!

The Reply-Intent Detector + Auto Calendar Insert feature is fully implemented and ready to use.

Run the tests, configure your environment variables, and start converting interested replies into booked meetings automatically! 🚀
