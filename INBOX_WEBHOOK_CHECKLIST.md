# Inbox Reply Webhook - Implementation Checklist

## ✅ Files Created

- [x] `/src/app/api/inbox/replies/route.ts` - Webhook endpoint
- [x] `/supabase/migrations/20251016000000_create_messages_table.sql` - Database schema
- [x] `/test-inbox-webhook.sh` - Automated test suite
- [x] `/INBOX_REPLY_WEBHOOK_SETUP.md` - Comprehensive setup guide
- [x] `/INBOX_WEBHOOK_IMPLEMENTATION_SUMMARY.md` - Implementation documentation
- [x] `/INBOX_WEBHOOK_QUICK_START.md` - Quick start guide
- [x] `/env.template` - Updated with PROVIDER_WEBHOOK_SECRET

---

## 📋 Setup Tasks

### Development Environment

- [ ] Copy `env.template` to `.env.local`
- [ ] Set `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` (your Supabase project URL)
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` (from Supabase settings)
- [ ] Set `OPENAI_API_KEY` (from OpenAI dashboard)
- [ ] Generate and set `PROVIDER_WEBHOOK_SECRET` (run: `openssl rand -hex 32`)

### Database Setup

- [ ] Run migration in Supabase SQL Editor: `20251016000000_create_messages_table.sql`
- [ ] Verify `messages` table created: `SELECT * FROM messages LIMIT 1;`
- [ ] Verify indexes created: `\d messages` (in psql)
- [ ] Check RLS policies enabled: `SELECT * FROM pg_policies WHERE tablename='messages';`

### Local Testing

- [ ] Start dev server: `npm run dev`
- [ ] Make test script executable: `chmod +x test-inbox-webhook.sh`
- [ ] Run test suite: `./test-inbox-webhook.sh`
- [ ] Verify test 1 (positive reply) returns `"intent": "MEETING_INTENT"`
- [ ] Verify test 2 (negative reply) returns `"intent": "NO_INTENT"`
- [ ] Check messages in Supabase: `SELECT * FROM messages ORDER BY created_at DESC;`
- [ ] Check meetings created: `SELECT * FROM meetings ORDER BY detected_at DESC;`

### Production Deployment

- [ ] Deploy to production (Vercel/Railway/etc.)
- [ ] Set environment variables in production
- [ ] Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Test production endpoint: `curl -X POST https://your-domain.com/api/inbox/replies ...`

### Email Provider Configuration

#### Choose your provider:

**Option A: Resend**
- [ ] Login to Resend dashboard
- [ ] Go to **Webhooks** section
- [ ] Add webhook URL: `https://your-domain.com/api/inbox/replies`
- [ ] Enable **Inbound Email** event
- [ ] Set signing secret to match `PROVIDER_WEBHOOK_SECRET`
- [ ] Test webhook with Resend's testing tool

**Option B: Mailgun**
- [ ] Login to Mailgun dashboard
- [ ] Go to **Receiving** → **Routes**
- [ ] Create route to forward to `https://your-domain.com/api/inbox/replies`
- [ ] Go to **Settings** → **Webhooks**
- [ ] Set signing key to match `PROVIDER_WEBHOOK_SECRET`
- [ ] Configure HTTP POST with JSON body
- [ ] Test with Mailgun's webhook tester

**Option C: SendGrid**
- [ ] Login to SendGrid dashboard
- [ ] Go to **Settings** → **Inbound Parse**
- [ ] Add domain and URL: `https://your-domain.com/api/inbox/replies`
- [ ] Enable **POST the raw, full MIME message**
- [ ] Configure webhook signature with `PROVIDER_WEBHOOK_SECRET`
- [ ] Test with SendGrid's webhook tester

### Production Verification

- [ ] Send real test email to your inbound address
- [ ] Check webhook received (view application logs)
- [ ] Verify message stored in Supabase
- [ ] Verify intent classified correctly
- [ ] If positive reply, verify meeting created
- [ ] Check response time < 5 seconds
- [ ] Monitor error rate (should be 0%)

---

## 🧪 Acceptance Tests

Run these tests to verify everything works:

### Test 1: Positive Reply (Meeting Intent)
```bash
curl -X POST http://localhost:3000/api/inbox/replies \
  -H "Content-Type: application/json" \
  -d '{
    "from": "interested@example.com",
    "to": "you@smartsend.ai",
    "text": "Yes, I am interested! Can we schedule a call?"
  }'
```

**Expected:**
- ✅ Returns 200 OK
- ✅ `"intent": "MEETING_INTENT"`
- ✅ `"meeting_created": true`
- ✅ `calendly_url` is populated
- ✅ Message in `messages` table
- ✅ Meeting in `meetings` table

### Test 2: Negative Reply (No Intent)
```bash
curl -X POST http://localhost:3000/api/inbox/replies \
  -H "Content-Type: application/json" \
  -d '{
    "from": "notinterested@example.com",
    "to": "you@smartsend.ai",
    "text": "Not interested, please remove me."
  }'
```

**Expected:**
- ✅ Returns 200 OK
- ✅ `"intent": "NO_INTENT"`
- ✅ `"meeting_created": false`
- ✅ Message in `messages` table
- ✅ No meeting created

### Test 3: Invalid Signature (Security)
```bash
curl -X POST http://localhost:3000/api/inbox/replies \
  -H "Content-Type: application/json" \
  -d '{
    "from": "attacker@example.com",
    "to": "you@smartsend.ai",
    "text": "Malicious",
    "signature": "invalid_signature"
  }'
```

**Expected (if PROVIDER_WEBHOOK_SECRET is set):**
- ✅ Returns 401 Unauthorized
- ✅ No message created

### Test 4: Database Queries
```sql
-- Check recent messages
SELECT 
  from_email, 
  reply_intent, 
  created_at 
FROM messages 
ORDER BY created_at DESC 
LIMIT 10;

-- Check meeting conversion rate
SELECT 
  COUNT(*) FILTER (WHERE reply_intent = 'MEETING_INTENT') as interested,
  COUNT(*) as total_replies,
  ROUND(100.0 * COUNT(*) FILTER (WHERE reply_intent = 'MEETING_INTENT') / NULLIF(COUNT(*), 0), 2) as conversion_rate
FROM messages
WHERE direction = 'inbound';
```

---

## 🚀 Post-Launch Monitoring

### Metrics to Track

- [ ] Total inbound replies/day
- [ ] Intent classification distribution (MEETING_INTENT vs NO_INTENT)
- [ ] Meeting conversion rate (%)
- [ ] Webhook response time (avg, p95, p99)
- [ ] Error rate (failed classifications, DB errors)
- [ ] OpenAI API cost per reply

### Alerts to Set Up

- [ ] Error rate > 5% → Alert team
- [ ] Webhook response time > 10s → Investigate
- [ ] Database connection failures → Page on-call
- [ ] OpenAI API failures → Fallback to keyword-based detection

### Weekly Review

- [ ] Review sample of classifications for accuracy
- [ ] Analyze false positives (NO_INTENT should be MEETING_INTENT)
- [ ] Analyze false negatives (MEETING_INTENT should be NO_INTENT)
- [ ] Tune OpenAI prompt if needed
- [ ] Review cost: replies × $0.001/reply

---

## 📊 Success Criteria

Your implementation is successful when:

✅ **Functionality**
- Webhook receives 100% of inbound emails
- Intent classification accuracy > 90%
- Auto-calendar triggers for all MEETING_INTENT replies
- Zero data loss (all emails persisted)

✅ **Performance**
- Response time < 5 seconds (95th percentile)
- Uptime > 99.9%
- Error rate < 1%

✅ **Business Impact**
- Reply → Meeting conversion visible in analytics
- MB/100 metric trackable
- User can see all inbound replies in dashboard (future)

---

## 🔧 Troubleshooting Resources

| Issue | Resource |
|-------|----------|
| Setup questions | `INBOX_WEBHOOK_QUICK_START.md` |
| Configuration details | `INBOX_REPLY_WEBHOOK_SETUP.md` |
| Architecture/implementation | `INBOX_WEBHOOK_IMPLEMENTATION_SUMMARY.md` |
| Testing problems | Run `./test-inbox-webhook.sh` |
| Database issues | Check migration file and RLS policies |
| Provider integration | See provider-specific docs in setup guide |

---

## 📝 Next Steps

Once this checklist is complete:

### Immediate Enhancements
1. **User Resolution** - Map `to_email` → `user_id`
2. **Analytics Dashboard** - Visualize MB/100 metric
3. **Enhanced Intents** - Add OOO, FOLLOW_UP, PRICING categories

### Future Features
1. Auto-responder based on intent
2. Reply threading and conversation view
3. Sentiment analysis
4. A/B testing different auto-responses
5. Predictive lead scoring based on reply patterns

---

## ✅ Sign-Off

- [ ] All files created and committed
- [ ] Database migration applied
- [ ] Environment configured
- [ ] Tests passing
- [ ] Email provider configured
- [ ] Production deployed and verified
- [ ] Monitoring/alerts set up
- [ ] Team trained on new feature

**Date Completed:** _______________  
**Deployed By:** _______________  
**Production URL:** _______________  

---

**Status:** ✅ Ready for production use  
**Estimated Setup Time:** 10-15 minutes  
**Estimated Value:** Direct tracking of Reply → Meeting conversion (MB/100)
