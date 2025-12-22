# SmartSend Sequence Scheduler Implementation

This document provides a complete implementation of the SmartSend sequence scheduler system with Supabase backend, Edge Functions, and Next.js frontend.

## 🏗️ Architecture Overview

The system consists of:
- **Supabase Schema**: `email_sequences`, `sequence_steps_new`, `sequence_jobs` tables
- **Edge Function**: `sequence-worker` that processes due jobs
- **API Endpoint**: `/api/smartsend/schedule-test` for creating demo sequences
- **UI Page**: `/smartsend` for testing the flow

## 📋 Setup Checklist

### 1. Database Schema ✅
Run the migration in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20250101000000_smartsend_sequence_scheduler.sql
-- Contains: email_sequences, sequence_steps_new, sequence_jobs tables with RLS policies
```

### 2. Environment Variables ✅
Add to your `.env.local`:
```bash
# SmartSend Sequence Scheduler Configuration
SMARTSEND_CRON_SECRET=superlongrandomstring   # for worker auth
FROM_EMAIL=no-reply@smartsend.ai   # placeholder sender
```

### 3. Supabase Edge Function ✅
Deploy the sequence worker:
- **File**: `supabase/functions/sequence-worker/index.ts`
- **Deploy**: Supabase Dashboard → Edge Functions → New Function → name: `sequence-worker`
- **Schedule**: Create a scheduled function (every 1 min) that calls the function endpoint with `Authorization: Bearer <SMARTSEND_CRON_SECRET>`

### 4. Server Helper ✅
**File**: `src/lib/supabase.ts` - Service role client for server-side operations

### 5. API Endpoint ✅
**File**: `src/app/api/smartsend/schedule-test/route.ts` - Creates demo sequences and jobs

### 6. UI Page ✅
**File**: `src/app/smartsend/page.tsx` - Minimal interface for testing

## 🧪 Testing the Flow

### Step 1: Access the UI
Navigate to `/smartsend` in your app

### Step 2: Schedule a Test Sequence
1. Enter a test email address
2. Click "Schedule Test"
3. You should see: "Scheduled 2 steps. First run at [time]"

### Step 3: Verify Database
Check Supabase Table Editor:
- `email_sequences`: Should have 1 new sequence
- `sequence_steps_new`: Should have 2 steps
- `sequence_jobs`: Should have 2 jobs (one immediate, one +30 min)

### Step 4: Trigger Worker (Manual)
If scheduled function isn't set up yet:
```bash
curl -H "Authorization: Bearer <SMARTSEND_CRON_SECRET>" <your-function-url>
```

### Step 5: Verify Execution
Refresh `sequence_jobs` table:
- First job should show `status: "sent"` and `sent_at: [timestamp]`
- Check Supabase Edge Function logs for console output: `[SmartSend] → email@example.com :: Subject`

## 🔧 Key Components

### Database Tables
- **email_sequences**: Main sequence definitions
- **sequence_steps_new**: Individual email steps with delays
- **sequence_jobs**: Queued jobs for each contact×step combination

### Edge Function Logic
1. Fetches up to 50 due jobs (`status=queued` and `run_at <= now`)
2. For each job:
   - Fetches step template
   - "Sends" email (console log placeholder)
   - Updates job status to `sent` or `failed`

### API Endpoint Logic
1. Creates a demo sequence with 2 steps
2. Generates jobs for the contact with proper timing
3. Returns sequence ID and job details

## 🚀 Next Steps

### Production Enhancements
1. **Real Email Sending**: Replace console.log with actual email sending
2. **User Authentication**: Use real user_id from auth instead of random UUID
3. **Template Variables**: Implement `{{company}}` and other personalization
4. **Error Handling**: Add retry logic and better error reporting
5. **Monitoring**: Add metrics and alerting for failed jobs

### Advanced Features
1. **Sequence Management UI**: Full CRUD interface for sequences
2. **Contact Management**: Import contacts and assign to sequences
3. **Analytics**: Track open rates, click rates, replies
4. **A/B Testing**: Multiple subject lines per step
5. **Conditional Logic**: Skip steps based on contact behavior

## 🐛 Troubleshooting

### Common Issues
1. **RLS Policies**: Ensure Service Role has access to all tables
2. **Environment Variables**: Verify `SMARTSEND_CRON_SECRET` matches in function and API calls
3. **Table Names**: Note that steps table is `sequence_steps_new` (not `sequence_steps`)
4. **CORS**: Edge function should handle CORS if called from browser

### Debug Steps
1. Check Supabase Edge Function logs
2. Verify database permissions
3. Test API endpoint directly with curl
4. Check environment variables are loaded correctly

## 📊 Database Schema Reference

```sql
-- Sequences table
email_sequences (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  status sequence_status DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Steps table  
sequence_steps_new (
  id uuid PRIMARY KEY,
  sequence_id uuid REFERENCES email_sequences(id),
  step_no int NOT NULL,
  template_subject text NOT NULL,
  template_body text NOT NULL,
  delay_minutes int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(sequence_id, step_no)
)

-- Jobs table
sequence_jobs (
  id uuid PRIMARY KEY,
  sequence_id uuid REFERENCES email_sequences(id),
  step_id uuid REFERENCES sequence_steps_new(id),
  contact_email text NOT NULL,
  run_at timestamptz NOT NULL,
  status text DEFAULT 'queued',
  last_error text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
)
```

The SmartSend sequence scheduler is now fully implemented and ready for testing! 🎉