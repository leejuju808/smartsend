# 🚀 Reply-Intent Detector Quick Start

## ⚡ Get Started in 3 Steps

### 1️⃣ Set Environment Variables

Add to `.env.local`:
```bash
# Required
OPENAI_API_KEY=sk-your_openai_api_key

# Email (SMTP example)
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# Optional
CALENDLY_URL=https://calendly.com/smartsend-ai/demo
```

### 2️⃣ Start Dev Server

```bash
npm run dev
```

### 3️⃣ Test It

```bash
# Run test script
./scripts/test-reply-intent.sh

# Or manually test
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "subject": "Demo",
    "body": "I am interested in learning more"
  }'
```

---

## 📚 Full Documentation

- **API Docs**: `/docs/REPLY-INTENT-API.md`
- **Env Setup**: `/REPLY_INTENT_ENV_SETUP.md`
- **Implementation Summary**: `/REPLY_INTENT_IMPLEMENTATION_COMPLETE.md`

---

## 🎯 What It Does

1. **Classifies** email replies into: `Interested`, `Not Interested`, `Out of Office`, `Follow Up Later`
2. **Automatically sends** email with Calendly link + ICS attachment when intent is `Interested`
3. **Increases MB/100** (Meetings Booked per 100 Replies) - our North Star metric

---

## ✅ Acceptance Criteria

✓ Returns correct intent value  
✓ Sends email + ICS file if "Interested"  
✓ No crash on unexpected inputs  

---

## 🔗 Integration Example

```typescript
// In your email webhook handler
const result = await fetch('/api/reply-intent', {
  method: 'POST',
  body: JSON.stringify({
    from: email.from,
    subject: email.subject,
    body: email.text
  })
});

if (result.status === 'email_sent') {
  console.log('✅ Meeting invite sent!');
}
```

That's it! 🎉
