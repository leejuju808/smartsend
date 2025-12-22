# ✅ Acceptance Checklist - Bounce Webhooks

Use this checklist to verify the implementation meets all requirements.

## 🗄️ Database Setup

- [ ] **Migration applied**
  ```bash
  # Copy supabase/migrations/20251018_bounce_webhooks.sql
  # Run in Supabase Studio SQL Editor
  ```

- [ ] **Tables exist**
  ```sql
  -- Verify these tables exist:
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name IN ('messages', 'suppressions', 'webhook_events', 'senders', 'sender_alerts', 'campaign_alerts');
  ```

- [ ] **Messages columns added**
  ```sql
  -- Verify messages has these columns:
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'messages' 
  AND column_name IN ('bounce', 'bounced_at', 'complaint', 'complained_at', 'transport_message_id', 'campaign_id');
  ```

- [ ] **View created**
  ```sql
  SELECT * FROM v_sender_health LIMIT 1;
  ```

## 🔐 Environment Setup

- [ ] **Required variables set** (`.env.local`)
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  SUPABASE_SERVICE_ROLE_KEY=...
  ```

- [ ] **Optional variables** (leave empty to bypass verification)
  ```bash
  SENDGRID_PUBLIC_KEY=
  MAILGUN_SIGNING_KEY=
  AWS_SNS_VERIFY=false
  ```

## 🚀 Server Running

- [ ] **Dev server started**
  ```bash
  npm run dev
  # Should start on http://localhost:3000
  ```

- [ ] **No console errors** - Check terminal for errors

## 🧪 Test #1: Suppressions UI

- [ ] **Navigate to**: http://localhost:3000/suppressions
- [ ] **Page loads** without errors
- [ ] **Add manual suppression**:
  - Email: `test@example.com`
  - Reason: `manual test`
  - Click "Add"
- [ ] **Suppression appears** in table below
- [ ] **Timestamp shows** in "Created" column

**Expected UI:**
```
╔══════════════════════════════════════════╗
║ Suppressions                             ║
║ Emails we will never send to.            ║
╠══════════════════════════════════════════╣
║ Add suppression                          ║
║ [email@example.com] [reason] [Add]       ║
╠══════════════════════════════════════════╣
║ Email            | Reason  | Created     ║
║ test@example.com | manual  | 10/18/25... ║
╚══════════════════════════════════════════╝
```

## 🧪 Test #2: SendGrid Bounce

- [ ] **Run curl command**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -H "User-Agent: SendGrid/1.0" \
    -d '[{"email":"bounced@example.com","event":"bounce","reason":"550 5.1.1 user unknown","sg_message_id":"abc123.transport"}]'
  ```

- [ ] **Response received**:
  ```json
  {
    "success": true,
    "processed": 1
  }
  ```

- [ ] **Verify in database**:
  ```sql
  -- Check webhook logged
  SELECT * FROM webhook_events WHERE provider = 'sendgrid' ORDER BY received_at DESC LIMIT 1;
  
  -- Check suppression added
  SELECT * FROM suppressions WHERE email = 'bounced@example.com';
  -- Should show: reason = "550 5.1.1 user unknown"
  
  -- If message with transport_message_id='abc123.transport' exists:
  SELECT bounce, bounced_at FROM messages WHERE transport_message_id = 'abc123.transport';
  -- Should show: bounce = true, bounced_at = [timestamp]
  ```

## 🧪 Test #3: Mailgun Bounce

- [ ] **Run curl command**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -H "User-Agent: Mailgun/1.0" \
    -d '{"signature":{"timestamp":"123","token":"test","signature":"test"},"event-data":{"event":"failed","reason":"bounce","recipient":"hardbounce@example.com","delivery-status":{"message":"hard fail"},"message":{"headers":{"message-id":"<mg-123@domain>"}}}}'
  ```

- [ ] **Response received**:
  ```json
  {
    "success": true,
    "processed": 1
  }
  ```

- [ ] **Verify in database**:
  ```sql
  SELECT * FROM webhook_events WHERE provider = 'mailgun' ORDER BY received_at DESC LIMIT 1;
  SELECT * FROM suppressions WHERE email = 'hardbounce@example.com';
  ```

## 🧪 Test #4: SES Bounce

- [ ] **Run curl command**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -H "X-Amz-Sns-Message-Type: Notification" \
    -d '{"notificationType":"Bounce","mail":{"messageId":"ses-123"},"bounce":{"bounceType":"Permanent","bounceSubType":"General","bouncedRecipients":[{"emailAddress":"sesbounce@example.com"}]}}'
  ```

- [ ] **Response received**:
  ```json
  {
    "success": true,
    "processed": 1
  }
  ```

- [ ] **Verify in database**:
  ```sql
  SELECT * FROM webhook_events WHERE provider = 'ses' ORDER BY received_at DESC LIMIT 1;
  SELECT * FROM suppressions WHERE email = 'sesbounce@example.com';
  ```

## 🧪 Test #5: SendGrid Spam Complaint

- [ ] **Run curl command**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -H "User-Agent: SendGrid/1.0" \
    -d '[{"email":"complainer@example.com","event":"spamreport","sg_message_id":"spam456.transport"}]'
  ```

- [ ] **Response received**:
  ```json
  {
    "success": true,
    "processed": 1
  }
  ```

- [ ] **Verify in database**:
  ```sql
  SELECT * FROM suppressions WHERE email = 'complainer@example.com';
  -- Should show: reason = "complaint" or "spamreport"
  ```

## 🧪 Test #6: SES Complaint

- [ ] **Run curl command**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -H "X-Amz-Sns-Message-Type: Notification" \
    -d '{"notificationType":"Complaint","mail":{"messageId":"ses-complaint-789"},"complaint":{"complainedRecipients":[{"emailAddress":"sesComplaint@example.com"}]}}'
  ```

- [ ] **Response received**:
  ```json
  {
    "success": true,
    "processed": 1
  }
  ```

- [ ] **Verify in database**:
  ```sql
  SELECT * FROM suppressions WHERE email = 'sescomplaint@example.com';
  -- Should show: reason = "complaint"
  ```

## 🧪 Test #7: Automated Test Suite

- [ ] **Run test script**:
  ```bash
  ./test-bounce-webhooks.sh
  ```

- [ ] **All tests pass** (green checkmarks)
- [ ] **Summary shows**: "✅ Bounce webhook testing complete!"

## 🧪 Test #8: Suppressions API

- [ ] **List suppressions**:
  ```bash
  curl http://localhost:3000/api/suppressions/list | jq
  ```
  Expected:
  ```json
  {
    "success": true,
    "items": [
      {
        "id": "uuid",
        "email": "test@example.com",
        "reason": "manual test",
        "created_at": "2025-10-18T..."
      }
    ]
  }
  ```

- [ ] **Add suppression**:
  ```bash
  curl -X POST http://localhost:3000/api/suppressions/add \
    -H "Content-Type: application/json" \
    -d '{"email":"api-test@example.com","reason":"api test"}'
  ```
  Expected:
  ```json
  {
    "success": true
  }
  ```

## 🧪 Test #9: Alert System (If senders/campaigns exist)

- [ ] **Create test sender**:
  ```sql
  INSERT INTO senders (email, display_name)
  VALUES ('sender@example.com', 'Test Sender');
  ```

- [ ] **Create test message**:
  ```sql
  INSERT INTO messages (email_from, email_to, transport_message_id, direction)
  VALUES ('sender@example.com', 'test-bounce@example.com', 'test-123', 'outbound');
  ```

- [ ] **Send bounce webhook**:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/bounce \
    -H "Content-Type: application/json" \
    -d '[{"email":"test-bounce@example.com","event":"bounce","sg_message_id":"test-123"}]'
  ```

- [ ] **Verify alert created**:
  ```sql
  SELECT sa.*, s.email 
  FROM sender_alerts sa 
  JOIN senders s ON s.id = sa.sender_id 
  WHERE s.email = 'sender@example.com'
  ORDER BY sa.created_at DESC LIMIT 1;
  -- Should show: code = 'BOUNCE_EVENT', level = 'warning'
  ```

## 🧪 Test #10: Safety Page (If exists)

- [ ] **Navigate to**: http://localhost:3000/safety
- [ ] **"Recent Alerts" section** shows `BOUNCE_EVENT` and `COMPLAINT_EVENT` warnings
- [ ] **Bounce rates** display correctly
- [ ] **Complaint rates** display correctly

## 📊 Final Database Verification

- [ ] **Check record counts**:
  ```sql
  SELECT 
    (SELECT COUNT(*) FROM webhook_events) as webhook_events,
    (SELECT COUNT(*) FROM suppressions) as suppressions,
    (SELECT COUNT(*) FROM sender_alerts) as sender_alerts,
    (SELECT COUNT(*) FROM campaign_alerts) as campaign_alerts;
  ```
  Should show non-zero counts for webhook_events and suppressions

- [ ] **Check sender health view**:
  ```sql
  SELECT * FROM v_sender_health;
  ```
  Should return data without errors

- [ ] **Check suppressions have reasons**:
  ```sql
  SELECT email, reason FROM suppressions WHERE reason IS NOT NULL LIMIT 5;
  ```
  Should show various reasons (bounce descriptions, "complaint", "manual", etc.)

## 🎯 Acceptance Criteria Met

- [x] ✅ Bounce webhook accepts SendGrid format
- [x] ✅ Bounce webhook accepts Mailgun format  
- [x] ✅ Bounce webhook accepts SES format
- [x] ✅ Complaint/spam reports handled
- [x] ✅ Signature verification implemented (optional)
- [x] ✅ Messages marked as bounced/complained
- [x] ✅ Suppressions list auto-updated
- [x] ✅ Sender alerts created
- [x] ✅ Campaign alerts created
- [x] ✅ Webhook events logged for debugging
- [x] ✅ Suppressions UI functional
- [x] ✅ Suppressions API endpoints working
- [x] ✅ Health view includes bounce/complaint metrics
- [x] ✅ Test suite provided

## 🚀 Ready for Production

Once all checkboxes above are complete:

- [ ] Apply migration to production database
- [ ] Set production environment variables (with real signing keys)
- [ ] Configure provider webhooks to point to production URL
- [ ] Monitor `webhook_events` table for incoming webhooks
- [ ] Set up alerts for high bounce/complaint rates
- [ ] Create cleanup cron job for old webhook events

---

**Last Updated**: October 18, 2025
