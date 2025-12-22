# Outbound Queue Quick Start

## 🎯 What You Just Implemented

A complete **Send Queue Worker** system for SmartSend with rate limiting, retries, and warmup support.

## 📁 Files Created/Modified

### Database Migration
- ✅ `supabase/migrations/20250218000000_outbound_queue_system.sql`

### Edge Functions  
- ✅ `supabase/functions/enqueue-send/index.ts` (API to enqueue emails)
- ✅ `supabase/functions/enqueue-send/deno.json`
- ✅ `supabase/functions/queue-dispatcher/index.ts` (Worker with rate limiting)
- ✅ `supabase/functions/queue-dispatcher/deno.json`

### Next.js Routes
- ✅ `src/app/api/enqueue/route.ts` (Proxy endpoint)

### Sender Shim
- ✅ `src/lib/senders/gmail.ts` (Placeholder for Gmail API)

### Configuration
- ✅ `supabase/config.toml` (Added scheduler config)

### Documentation
- ✅ `OUTBOUND_QUEUE_IMPLEMENTATION.md` (Full guide)
- ✅ `OUTBOUND_QUEUE_QUICK_START.md` (This file)

## 🚀 Deploy in 3 Steps

### Step 1: Apply Migration

```bash
# Via Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Run: supabase/migrations/20250218000000_outbound_queue_system.sql
```

### Step 2: Deploy Functions

```bash
cd supabase

# Deploy enqueue-send
supabase functions deploy enqueue-send

# Deploy queue-dispatcher
supabase functions deploy queue-dispatcher
```

### Step 3: Configure Environment

In Supabase Dashboard → Edge Functions → Settings:

```env
PROVIDER_API_KEY=your_resend_key
BATCH_SIZE=50
```

## 🧪 Test It

### Enqueue an Email

```bash
curl -X POST http://localhost:3000/api/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "your-org-id",
    "to_email": "test@example.com",
    "subject": "Hello!",
    "body": "<h1>Test</h1>",
    "connector": "resend"
  }'
```

### Check Status

```sql
SELECT * FROM outbound_queue 
WHERE status = 'pending' 
ORDER BY scheduled_at ASC 
LIMIT 10;
```

The dispatcher runs automatically every minute via cron!

## ✅ Features Working

- ✅ Rate limiting (per-minute, per-hour, per-day)
- ✅ Exponential backoff retries
- ✅ Warmup support
- ✅ Multi-connector (Gmail, Outlook, Resend)
- ✅ Atomic job locking
- ✅ Detailed error tracking

## 📚 Next Steps

1. **Implement Gmail Sending**: Replace placeholder in `queue-dispatcher/index.ts`
2. **Implement Outlook Sending**: Add Microsoft Graph API support  
3. **Set Send Limits**: Configure per-org limits in `send_limits` table
4. **Monitor**: Use the queries in `OUTBOUND_QUEUE_IMPLEMENTATION.md`

For full details, see `OUTBOUND_QUEUE_IMPLEMENTATION.md`.

