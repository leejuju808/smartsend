# Cadence System - Quick Start Guide

Get your email cadence system up and running in 5 minutes.

---

## ⚡ Installation

### 1. Apply Database Migration

Run this SQL in your Supabase SQL Editor:

```bash
# File: supabase/migrations/20250202000000_cadence_system.sql
# Copy/paste the contents into Supabase SQL Editor and run it
```

Or use Supabase CLI:
```bash
supabase db push
```

### 2. Verify Installation

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'cadence_%';

-- Should return:
-- cadence_sequences
-- cadence_steps
-- cadence_enrollments
-- cadence_send_queue
```

---

## 🚀 Quick Test

### Create Your First Sequence

```sql
-- Get your user_id
SELECT id FROM auth.users WHERE email = 'your-email@example.com';

-- Create a sequence
INSERT INTO cadence_sequences (name, owner_user_id, timezone) 
VALUES (
  'Discovery 3-step', 
  'YOUR_USER_ID_HERE', 
  'America/Los_Angeles'
);

-- Get the sequence_id
SELECT id FROM cadence_sequences WHERE name = 'Discovery 3-step';

-- Add steps
INSERT INTO cadence_steps (sequence_id, step_index, wait_days, subject, body)
VALUES 
  ('SEQUENCE_ID_HERE', 0, 0, 'Welcome!', 'Hi {{first_name}}, thanks for connecting!'),
  ('SEQUENCE_ID_HERE', 1, 2, 'Follow-up', 'Hi {{first_name}}, just circling back...'),
  ('SEQUENCE_ID_HERE', 2, 5, 'Final Touch', 'Hi {{first_name}}, last attempt to connect.');
```

### Enroll a Test Lead

```bash
curl -X POST http://localhost:3000/api/cadence/enroll \
  -H "Content-Type: application/json" \
  -d '{
    "sequenceId": "SEQUENCE_ID_HERE",
    "lead": {
      "email": "test@example.com",
      "first_name": "John",
      "company": "Acme Corp"
    }
  }'
```

### Check the Queue

```sql
SELECT 
  to_email,
  subject,
  scheduled_at,
  sent_at,
  attempts
FROM cadence_send_queue
WHERE sent_at IS NULL
ORDER BY scheduled_at;
```

### Trigger the Cron (Manual Test)

```bash
curl -X POST http://localhost:3000/api/cron/cadence-send
```

Or wait 5 minutes for the Vercel cron to run automatically.

### Verify Send

```sql
-- Check if sent
SELECT * FROM cadence_send_queue WHERE to_email = 'test@example.com';

-- Check enrollment status
SELECT status, current_step, last_sent_at 
FROM cadence_enrollments 
WHERE lead_email = 'test@example.com';
```

---

## 🎯 Common Operations

### Pause an Enrollment

```bash
curl -X PATCH http://localhost:3000/api/cadence/enrollment/ENROLLMENT_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```

### Resume an Enrollment

```bash
curl -X PATCH http://localhost:3000/api/cadence/enrollment/ENROLLMENT_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### Cancel an Enrollment

```bash
curl -X PATCH http://localhost:3000/api/cadence/enrollment/ENROLLMENT_ID_HERE \
  -H "Content-Type: application/json" \
  -d '{"status": "cancelled"}'
```

### Simulate a Reply (Auto-Stop Test)

```sql
-- First, create a campaign_log entry linking to the lead
INSERT INTO campaign_logs (
  campaign_id, 
  lead_id, 
  from_email, 
  to_email, 
  subject, 
  replied, 
  reply_type
) VALUES (
  'CAMPAIGN_ID_HERE',
  'LEAD_ID_HERE',
  'test@example.com',
  'your-email@example.com',
  'Re: Welcome!',
  true,
  'interested'
);

-- Check enrollment auto-stopped
SELECT status, replied, reply_type 
FROM cadence_enrollments 
WHERE lead_email = 'test@example.com';
-- Should show: status='completed', replied=true
```

---

## 📊 Monitoring

### Queue Health

```sql
SELECT 
  COUNT(*) filter (where sent_at is null) as pending,
  COUNT(*) filter (where sent_at is not null) as sent,
  COUNT(*) filter (where attempts > 3) as failed,
  COUNT(*) filter (where attempts = 0 and sent_at is null) as ready
FROM cadence_send_queue;
```

### Enrollment Overview

```sql
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) filter (where replied) as replied
FROM cadence_enrollments
GROUP BY status;
```

### Recent Activity

```sql
SELECT 
  e.lead_email,
  s.name as sequence_name,
  e.status,
  e.current_step,
  e.replied,
  e.last_sent_at,
  q.scheduled_at
FROM cadence_enrollments e
JOIN cadence_sequences s ON s.id = e.sequence_id
LEFT JOIN cadence_send_queue q ON q.enrollment_id = e.id
ORDER BY e.last_sent_at DESC NULLS LAST
LIMIT 20;
```

---

## ⚙️ Configuration

### Change Business Hours

```sql
UPDATE cadence_sequences 
SET daily_start = '09:00', daily_end = '17:00'
WHERE id = 'SEQUENCE_ID_HERE';
```

### Enable Weekend Sends

```sql
UPDATE cadence_sequences 
SET quiet_weekends = false
WHERE id = 'SEQUENCE_ID_HERE';
```

### Change Timezone

```sql
UPDATE cadence_sequences 
SET timezone = 'America/New_York'
WHERE id = 'SEQUENCE_ID_HERE';
```

---

## 🔧 Troubleshooting

### Emails Not Sending

1. **Check queue:**
   ```sql
   SELECT * FROM cadence_send_queue WHERE sent_at IS NULL ORDER BY scheduled_at;
   ```

2. **Verify Gmail connected:**
   ```sql
   SELECT * FROM connected_accounts WHERE provider = 'gmail';
   ```

3. **Check cron logs:**
   - Vercel Dashboard → Functions → `/api/cron/cadence-send`

### Auto-Stop Not Working

1. **Verify trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'trg_cadence_enroll_reply';
   ```

2. **Check campaign_logs:**
   ```sql
   SELECT * FROM campaign_logs 
   WHERE replied = true AND from_email = 'test@example.com';
   ```

3. **Test trigger manually:**
   ```sql
   UPDATE campaign_logs 
   SET replied = true, reply_type = 'test'
   WHERE from_email = 'test@example.com';
   ```

### Workers Not Processing

1. **Check locking:**
   ```sql
   SELECT COUNT(*) FROM cadence_send_queue 
   WHERE locked_at IS NOT NULL 
   AND locked_at > NOW() - INTERVAL '10 minutes';
   ```

2. **Unlock stuck items:**
   ```sql
   UPDATE cadence_send_queue 
   SET locked_at = NULL 
   WHERE locked_at < NOW() - INTERVAL '10 minutes';
   ```

---

## 📚 Next Steps

- Read `CADENCE_SYSTEM_README.md` for full documentation
- Check `CADENCE_IMPLEMENTATION_SUMMARY.md` for architecture details
- Build UI components for sequence management
- Add analytics dashboard
- Implement A/B testing

---

## ✅ Checklist

- [ ] Database migration applied
- [ ] Gmail account connected
- [ ] First sequence created
- [ ] Test lead enrolled
- [ ] Cron running (check Vercel)
- [ ] Email sent successfully
- [ ] Auto-stop tested
- [ ] Monitoring queries working

---

**Status:** Ready for production! 🚀

