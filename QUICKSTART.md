# Send Queue Quickstart

## What Was Built

✅ **Database Hardening** (`20250131000001_send_queue_hardening.sql`)
- Status constraint (enum-style check)
- Unique index to prevent duplicate campaigns/leads
- Foreign keys for referential integrity
- Performance indexes for fast lookups
- Atomic claim function using SKIP LOCKED

✅ **Edge Function** (`supabase/functions/send-queue/index.ts`)
- Simple API: `pull`, `sent`, `failed` operations
- Uses atomic RPC for race-free claiming
- Secret-based auth

✅ **Apps Script** (`supabase/functions/apps-script-example.gs`)
- Minute-by-minute tick function
- Pulls due items from edge function
- Sends via GmailApp
- Reports results back
- Gentle pacing to avoid rate limits

✅ **Documentation** (`SEND_QUEUE_SETUP.md`)
- Full setup guide
- Testing instructions
- Security notes

## Deploy in 3 Steps

### 1. Run Database Migration

```bash
# Apply migration
supabase migration up

# Or apply manually via Supabase SQL editor:
# Copy contents of supabase/migrations/20250131000001_send_queue_hardening.sql
```

### 2. Deploy Edge Function

```bash
cd supabase/functions/send-queue

# Deploy function
supabase functions deploy send-queue --no-verify-jwt

# Set secrets
supabase secrets set QUEUE_SECRET=your-random-secret-here
```

### 3. Setup Apps Script

1. Open [Google Apps Script](https://script.google.com)
2. Create new project
3. Copy/paste from `supabase/apps-script-example.gs`
4. **Project Settings → Script Properties:**
   - Add `QUEUE_URL`: `https://YOUR_PROJECT.functions.supabase.co/send-queue`
   - Add `QUEUE_SECRET`: same as Edge Function secret
5. **Triggers → + Add Trigger:**
   - Function: `sendTick`
   - Event: Time-driven → Every minute

## Test It

### 1. Create Campaign (via your app)

Use your existing `launchCampaign` or `buildQueueForCampaign`:
- Daily cap: 3
- Start: now + 2 minutes
- Import 2-3 test leads

### 2. Verify Queue

```sql
SELECT * FROM send_queue 
WHERE status = 'queued' 
ORDER BY scheduled_at;
```

### 3. Watch Logs

```sql
-- See sent items
SELECT * FROM send_logs ORDER BY sent_at DESC LIMIT 10;

-- See queue status
SELECT status, COUNT(*) FROM send_queue GROUP BY status;
```

### 4. Check Apps Script Execution Log

In Apps Script: **View → Executions**
- Should show "Pulled N items"
- Each send attempt logged

## Architecture

```
Launch Campaign → buildQueue() → INSERT into send_queue
                                        ↓
                         scheduled_at arrives
                                        ↓
            Apps Script Tick (every minute)
                                        ↓
            Edge Function /send-queue?op=pull
                                        ↓
              claim_due_queue() [SKIP LOCKED]
                                        ↓
                    GmailApp.sendEmail()
                                        ↓
              Edge Function /send-queue?op=sent
                                        ↓
               UPDATE status='sent' + INSERT log
```

## Key Features

🔄 **Atomic Claiming**: `claim_due_queue()` uses PostgreSQL SKIP LOCKED to prevent race conditions

🚫 **No Duplicates**: Unique constraint on `(campaign_id, lead_id)`

⚡ **Fast Lookups**: Composite index on `(status, scheduled_at)`

🔒 **Secure**: Secret-based auth, RLS-protected tables

📊 **Auditable**: Every send logged in `send_logs`

## Troubleshooting

**"No rows claimed"**
- Check `scheduled_at` is in the past
- Verify `status = 'queued'`
- Check RLS policies allow service role

**"Edge function not accessible"**
- Verify `QUEUE_SECRET` matches
- Check function is deployed: `supabase functions list`
- Test: `curl -H "x-ss-secret: YOUR_SECRET" https://YOUR_PROJECT.functions.supabase.co/send-queue?op=pull`

**"Apps Script error"**
- Check Script Properties are set
- Enable Gmail API in Google Cloud Console
- Verify your Google account has Gmail sending permissions

**"Foreign key violations"**
- Some schemas use `campaign_leads` vs `leads` for FK
- Migration handles both gracefully
- Check your actual FK dependencies

## Scaling Beyond MVP

When you need more volume:

1. **Replace GmailApp** with Gmail API (higher daily limits)
2. **Add SMTP providers**: SendGrid, Mailgun, AWS SES
3. **Add retry logic**: exponential backoff on failures
4. **Add rate limiting**: per-user/per-workspace caps
5. **Monitor**: alerts on high failure rates

## Next Steps

- ✅ DB hardening migration
- ✅ Atomic claim function
- ✅ Edge function API
- ✅ Apps Script tick
- 📝 **Optional**: Add retry button in UI for failed items
- 📝 **Optional**: Add `send_end` window to campaigns
- 📝 **Optional**: Email confirmation when tick sends

See `SEND_QUEUE_SETUP.md` for detailed documentation.
