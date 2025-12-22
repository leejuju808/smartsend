# Reply Intent API Setup

## Environment Variables Required

Create a `.env.local` file in your project root with:

```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
```

## Gmail App Password Setup

1. Enable 2-factor authentication on your Gmail account
2. Go to Google Account settings > Security > App passwords
3. Generate a new app password for "Mail"
4. Use this password (not your regular Gmail password) in `SMTP_PASS`

## Testing

Run the test script:
```bash
./test-reply-intent-api.sh
```

Or test manually:
```bash
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{"replyText":"Yes lets meet tomorrow","recipientEmail":"lead@example.com","senderEmail":"you@smartsend.ai"}'
```

## Expected Response

For positive intent:
```json
{"intent":"positive"}
```

For neutral/negative intent:
```json
{"intent":"neutral"}
```
or
```json
{"intent":"negative"}
```

## Features

- ✅ Detects reply intent using GPT-4o-mini
- ✅ Sends automated meeting invites for positive responses
- ✅ Includes ICS calendar file attachment
- ✅ Uses nodemailer for reliable email delivery
- ✅ Returns intent classification for further processing