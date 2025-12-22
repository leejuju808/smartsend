# Reply-Intent Detector Environment Variables

This document lists all environment variables needed for the Reply-Intent Detector + Auto Calendar Insert feature.

## Required Variables

### OpenAI API Key
```bash
OPENAI_API_KEY=sk-your_openai_api_key
```
Get your API key from: https://platform.openai.com/api-keys

## Email Provider Configuration

### Option 1: SMTP (Gmail Example)

```bash
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
```

**Gmail App Password Setup:**
1. Enable 2FA on your Google account
2. Go to: https://myaccount.google.com/apppasswords
3. Select "Mail" and generate app password
4. Use the 16-character password (not your login password)

### Option 2: Resend

```bash
MAIL_PROVIDER=resend
RESEND_API_KEY=re_your_resend_api_key
```

Get your Resend API key from: https://resend.com/api-keys

## Optional Configuration

### Meeting Details (has sensible defaults)

```bash
# Calendly link to include in emails
CALENDLY_URL=https://calendly.com/smartsend-ai/demo

# Organizer email address
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai

# Organizer name shown in emails
MEETING_ORGANIZER_NAME=SmartSend AI
```

## Full .env.local Example

```bash
# ===== Required =====
OPENAI_API_KEY=sk-proj-1234567890abcdef

# ===== Email Provider (choose one) =====
MAIL_PROVIDER=smtp

# SMTP (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=hello@smartsend.ai
SMTP_PASS=abcd efgh ijkl mnop

# Or Resend
# RESEND_API_KEY=re_123456789

# ===== Optional Meeting Config =====
CALENDLY_URL=https://calendly.com/smartsend-ai/demo
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai
MEETING_ORGANIZER_NAME=SmartSend AI
```

## Testing

After setting up your environment variables:

```bash
# Start dev server
npm run dev

# Test with curl
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "Demo",
    "body": "I am interested in learning more"
  }'
```

Expected response for "Interested" intent:
```json
{
  "intent": "Interested",
  "status": "email_sent",
  "message": "Meeting invite sent successfully"
}
```

Check the email inbox for `test@example.com` to verify the Calendly link and ICS attachment were sent.
