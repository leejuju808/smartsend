# Send Worker Quick Start

## ✅ What Was Implemented

A production-ready email delivery worker system with:
- ✅ Database migration for delivery tracking
- ✅ Enhanced mailer with provider message ID capture
- ✅ Secure cron endpoint with retry logic
- ✅ Manual testing UI in Send Safety page
- ✅ Vercel Cron configuration
- ✅ Environment variables template

## 🚀 Quick Setup (5 minutes)

### Step 1: Apply Database Migration

```bash
cd /path/to/smartsend-ai
supabase db push
```

This adds:
- `provider_message_id`, `attempts`, `last_error`, `sent_at`, `locked_at` to `messages` table
- New `delivery_logs` table for debugging
- Performance indexes for queue processing

### Step 2: Add Environment Variables

Add to your `.env.local`:

```bash
# Required
CRON_SECRET=your_super_secret_token_here

# Dev only (for manual testing button)
NEXT_PUBLIC_CRON_DEV_SECRET=your_super_secret_token_here

# Optional (defaults shown)
SEND_BATCH_SIZE=50
SEND_MAX_ATTEMPTS=5

# Mail provider (should already exist)
MAIL_PROVIDER=smtp  # or 'resend'
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
```

### Step 3: Start Dev Server

```bash
pnpm dev
```

### Step 4: Create Test Data

In Supabase SQL Editor:

```sql
-- Set your profile to active (for testing)
update public.profiles
set subscription_status = 'active'
where id = 'YOUR_PROFILE_ID';

-- Create a sender
insert into public.senders (
  profile_id, from_email, provider, status,
  base_daily_limit, target_daily_limit, hourly_limit, warmup_increment
) values (
  'YOUR_PROFILE_ID', 'you@yourdomain.com', 'smtp', 'active',
  20, 200, 30, 10
);

-- Queue a test message
insert into public.messages (
  profile_id, sender_id, to_email, subject, body, status
) values (
  'YOUR_PROFILE_ID',
  (select id from public.senders where profile_id='YOUR_PROFILE_ID' limit 1),
  'test@example.com',
  'Test Subject',
  '<p>Test message body</p>',
  'queued'
);
```

### Step 5: Test the Worker

#### Option A: Via UI
1. Go to `/send-safety` in your browser
2. Scroll to "Manual Delivery Worker (Dev)"
3. Click "Run Delivery Now"
4. Check the output

#### Option B: Via cURL
```bash
curl -H "x-cron-secret: your_super_secret_token_here" \
  http://localhost:3000/api/cron/deliver
```

You should see:
```json
{
  "processed": 1,
  "sent": 1,
  "failed": 0,
  "skipped": 0
}
```

### Step 6: Verify Results

Check the message was sent:

```sql
-- Check message status
select id, status, sent_at, provider_message_id, attempts, last_error
from public.messages
order by created_at desc
limit 5;

-- Check delivery logs
select event, to_email, detail, created_at
from public.delivery_logs
order by created_at desc
limit 10;
```

Expected results:
- Message `status` = `'sent'`
- `sent_at` is populated
- `provider_message_id` contains the provider's message ID
- `attempts` = 1
- `last_error` is null
- Delivery log shows `event = 'sent'`

## 📦 Production Deployment

### Vercel Setup

The `vercel.json` file is already configured to run the worker every 5 minutes:

```json
{
  "crons": [
    {
      "path": "/api/cron/deliver",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Important**: The cron endpoint checks the `CRON_SECRET` environment variable. In production:

1. Set `CRON_SECRET` in Vercel environment variables
2. Do NOT set `NEXT_PUBLIC_CRON_DEV_SECRET` in production (dev only)
3. The endpoint validates `req.headers.get('x-cron-secret')` matches `CRON_SECRET`

Vercel Cron will automatically pass the secret when it's configured in environment variables.

### Alternative Cron Setup

If not using Vercel Cron, use an external service:

```bash
# cron-job.org or similar
*/5 * * * * curl -H "x-cron-secret: YOUR_SECRET" https://yourdomain.com/api/cron/deliver
```

### Adjust Schedule

Edit `vercel.json` to change frequency:

- `*/1 * * * *` - Every minute (high frequency)
- `*/5 * * * *` - Every 5 minutes (recommended)
- `*/10 * * * *` - Every 10 minutes (lower frequency)
- `*/15 * * * *` - Every 15 minutes (very low frequency)

## 🔍 Monitoring & Debugging

### Check Delivery Stats

```sql
-- Today's stats
select event, count(*) as count
from public.delivery_logs
where created_at >= current_date
group by event;

-- Recent failures
select to_email, detail, created_at
from public.delivery_logs
where event = 'failed'
order by created_at desc
limit 20;

-- Stuck in queue
select id, to_email, created_at, attempts, last_error
from public.messages
where status = 'queued'
and created_at < now() - interval '1 hour'
order by created_at;
```

### Common Issues

**Messages stay queued:**
- Check Vercel Cron is enabled
- Verify `CRON_SECRET` matches
- Check API route logs

**"Not paid" errors:**
- Update `subscription_status` to `'active'` or `'trialing'`

**"Sender missing/paused" errors:**
- Verify sender exists and `status = 'active'`

**No provider message ID:**
- Check SMTP/Resend credentials
- Verify mailer is returning `{ messageId }`

## 📁 Files Modified/Created

| File | Type | Description |
|------|------|-------------|
| `/supabase/migrations/20251009_send_worker.sql` | New | Database schema for delivery tracking |
| `/src/lib/mailer.ts` | Modified | Added `sendMail()` function with headers & message ID |
| `/src/app/api/cron/deliver/route.ts` | New | Delivery worker endpoint |
| `/src/app/(dashboard)/send-safety/page.tsx` | Modified | Added manual trigger button |
| `/vercel.json` | New | Vercel Cron configuration |
| `/env.template` | Modified | Added delivery worker env vars |
| `/SEND_WORKER_IMPLEMENTATION.md` | New | Detailed documentation |

## 🎯 Why This Matters

This delivery worker is critical for the **MB/100 milestone** because:

1. **Enables Replies** - No delivery = no replies = no meetings
2. **Protects Sender Reputation** - Retry logic prevents spam-like behavior
3. **Enables Reply Threading** - Provider message IDs allow matching replies to sent messages
4. **Provides Observability** - Delivery logs enable debugging and monitoring
5. **Scales Reliably** - Batch processing prevents overwhelming email providers

## 📚 Next Steps

1. ✅ Verify local setup works
2. Deploy to production
3. Set up monitoring/alerts
4. Test with real messages
5. Tune `SEND_BATCH_SIZE` based on volume
6. Set up reply webhook to match on `provider_message_id`

## 💡 Tips

- Start with a small batch size (10-20) and increase gradually
- Monitor delivery logs daily for the first week
- Set up alerts for high failure rates (>5%)
- Keep `MAX_ATTEMPTS` at 5 to prevent infinite retries
- Use `locked_at` to debug stuck messages
- Check provider limits (SMTP/Resend daily quotas)

---

**Need help?** Check `/SEND_WORKER_IMPLEMENTATION.md` for detailed documentation.
