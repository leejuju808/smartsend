# Inbox Reply Webhook - Quick Start Guide

Get your inbox reply webhook up and running in **5 minutes**.

---

## Prerequisites

- Supabase project with service role key
- OpenAI API key (for intent classification)
- Email provider account (Resend, Mailgun, or SendGrid)

---

## Step 1: Environment Setup (2 min)

Create or update `.env.local`:

```bash
# Copy template
cp env.template .env.local

# Add these values
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PROVIDER_WEBHOOK_SECRET=$(openssl rand -hex 32)
OPENAI_API_KEY=sk-your_openai_key_here
```

---

## Step 2: Database Setup (1 min)

In **Supabase SQL Editor**, run:

```bash
supabase/migrations/20251016000000_create_messages_table.sql
```

Or via CLI:
```bash
supabase db push
```

**Verify:**
```sql
SELECT COUNT(*) FROM messages; -- Should return 0
```

---

## Step 3: Start Development Server (30 sec)

```bash
npm run dev
```

Server should start on `http://localhost:3000`

---

## Step 4: Test Locally (1 min)

Run the test script:

```bash
./test-inbox-webhook.sh
```

**Expected output:**
```
📧 Test 1: Positive reply (meeting intent)
{
  "id": "uuid-here",
  "intent": "MEETING_INTENT",
  "meeting_created": true,
  "calendly_url": "https://calendly.com/..."
}
```

**Verify in Supabase:**
```sql
SELECT from_email, reply_intent, created_at 
FROM messages 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## Step 5: Configure Email Provider (30 sec)

### Resend

1. Go to **Webhooks** in Resend dashboard
2. Add webhook URL: `https://your-domain.com/api/inbox/replies`
3. Enable **Inbound Email** event
4. Set signing secret to your `PROVIDER_WEBHOOK_SECRET`
5. Save

### Mailgun

1. Go to **Receiving** → **Routes**
2. Create route: Forward to `https://your-domain.com/api/inbox/replies`
3. Go to **Settings** → **Webhooks**
4. Set signing key to your `PROVIDER_WEBHOOK_SECRET`

### SendGrid

1. Go to **Settings** → **Inbound Parse**
2. Add host & URL: `https://your-domain.com/api/inbox/replies`
3. Enable **POST the raw, full MIME message**
4. In webhook settings, add signature key

---

## Testing Production

Send a test email to your inbound address:

**Email body:**
```
Hi, I'm interested in learning more about your product.
Can we schedule a call this week?
```

**Check webhook received:**
```bash
# View logs
vercel logs  # if on Vercel
# or check your server logs
```

**Verify in database:**
```sql
SELECT * FROM messages ORDER BY created_at DESC LIMIT 1;
SELECT * FROM meetings ORDER BY detected_at DESC LIMIT 1;
```

---

## Troubleshooting

### ❌ 401 Unauthorized

**Fix:** Set `PROVIDER_WEBHOOK_SECRET=""` for local dev, or ensure it matches your provider's config

### ❌ Classification failed (202 warning)

**Fix:** Verify `OPENAI_API_KEY` is valid:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### ❌ No meetings created

**Cause:** Reply text doesn't show clear interest

**Test with explicit interest:**
```bash
curl -X POST http://localhost:3000/api/inbox/replies \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@example.com",
    "to": "you@domain.com",
    "text": "Yes! I am very interested. Let'\''s schedule a meeting.",
    "provider": "resend"
  }'
```

---

## Success! 🎉

You now have:
- ✅ Webhook endpoint receiving inbound emails
- ✅ AI-powered intent classification
- ✅ Auto-calendar for interested prospects
- ✅ Full analytics in Supabase

**Next Steps:**
1. Deploy to production (Vercel/Railway/etc.)
2. Configure your email provider's production webhook
3. Build analytics dashboard (see `INBOX_WEBHOOK_IMPLEMENTATION_SUMMARY.md`)

---

## Quick Reference

| Resource | Location |
|----------|----------|
| Webhook endpoint | `/src/app/api/inbox/replies/route.ts` |
| Database migration | `/supabase/migrations/20251016000000_create_messages_table.sql` |
| Test script | `./test-inbox-webhook.sh` |
| Full docs | `INBOX_REPLY_WEBHOOK_SETUP.md` |
| Implementation summary | `INBOX_WEBHOOK_IMPLEMENTATION_SUMMARY.md` |

**Need help?** Review the full setup guide: `INBOX_REPLY_WEBHOOK_SETUP.md`
