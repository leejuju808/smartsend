# Email Sequence System Implementation

This implementation provides a complete email sequence system with automated scheduling and sending.

## Architecture

The system consists of three main components:

1. **Enrollment API** (`/api/enroll`) - Enrolls leads into sequences
2. **Scheduler Cron** (`/api/cron/scheduler`) - Promotes due enrollments to send jobs
3. **Worker Cron** (`/api/cron/worker`) - Processes queued send jobs

## Database Schema

### Tables Created

- `leads` - Stores lead information (email, name, user_id)
- `sequence_enrollments` - Tracks lead enrollment in sequences
- `send_jobs` - Queued email jobs ready to be sent

### Key Features

- Row Level Security (RLS) enabled on all tables
- Automatic lead deduplication by user_id + email
- Status tracking (active, paused, completed, canceled)
- Scheduled execution with configurable delays

## Setup Instructions

### 1. Run Database Migration

Execute the SQL migration in Supabase:
```sql
-- Run: supabase/migrations/20250129_email_sequence_system.sql
```

### 2. Configure Cron Jobs

The system is already configured in `vercel.json`:
- Scheduler: runs every 5 minutes
- Worker: runs every 5 minutes

### 3. Test the System

1. Create a sequence with steps using your existing UI
2. Use the test script: `node scripts/test-sequence-system.js`
3. Monitor progress via `/api/jobs`

## API Endpoints

### POST /api/enroll
Enrolls a lead into a sequence.

**Request:**
```json
{
  "email": "lead@example.com",
  "name": "Lead Name",
  "sequence_id": "uuid",
  "start_in_hours": 0
}
```

**Response:**
```json
{
  "enrollment": {
    "id": "uuid",
    "next_run_at": "2025-01-29T10:00:00Z",
    "next_step_order": 1
  }
}
```

### GET /api/jobs
Returns all send jobs for the authenticated user.

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "to": "lead@example.com",
      "subject": "Welcome Email",
      "status": "sent",
      "createdAt": "2025-01-29T10:00:00Z"
    }
  ]
}
```

### GET /api/cron/scheduler
Manually triggers the scheduler (promotes enrollments to jobs).

### GET /api/cron/worker
Manually triggers the worker (processes queued jobs).

## How It Works

1. **Enrollment**: Lead is enrolled via `/api/enroll`
   - Lead is upserted into `leads` table
   - Enrollment is created in `sequence_enrollments`
   - Next run time is calculated based on first step delay

2. **Scheduling**: Scheduler cron runs every 5 minutes
   - Finds enrollments where `next_run_at <= now()`
   - Creates `send_jobs` for the current step
   - Schedules next step or marks enrollment as completed

3. **Sending**: Worker cron runs every 5 minutes
   - Finds queued jobs where `run_at <= now()`
   - Marks jobs as "sending"
   - Simulates email sending (TODO: integrate real SMTP)
   - Marks jobs as "sent" or "failed"

## Status Flow

### Enrollment Status
- `active` - Currently enrolled and progressing
- `paused` - Temporarily stopped
- `completed` - Finished all steps
- `canceled` - Manually stopped

### Job Status
- `queued` - Waiting to be processed
- `sending` - Currently being sent
- `sent` - Successfully sent
- `failed` - Failed to send

## Next Steps

1. **SMTP Integration**: Replace the simulated email sending in the worker with real SMTP
2. **UI Components**: Add enrollment UI to your existing sequence management
3. **Monitoring**: Add logging and error tracking
4. **Rate Limiting**: Implement sending rate limits
5. **Unsubscribe**: Add unsubscribe handling

## Testing

Use the provided test script:
```bash
node scripts/test-sequence-system.js
```

Make sure to:
1. Replace `YOUR_SEQUENCE_ID_HERE` with a real sequence ID
2. Have a valid authentication session
3. Have a sequence with at least one step in your database