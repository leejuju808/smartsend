# Enhanced Email Sequences System

This document describes the enhanced email sequences system that has been implemented in SmartSend AI.

## Overview

The enhanced sequence system provides:
- **Multi-step email sequences** with configurable delays
- **Smart conditions** based on recipient behavior (opened, clicked, no_reply)
- **Automatic progression** through sequence steps
- **Contact enrollment management**
- **Cron-based scheduling** for automatic sending

## Database Schema

### Core Tables

#### `sequences`
```sql
create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

#### `sequence_steps`
```sql
create table public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.sequences(id) on delete cascade,
  step_number int not null,
  subject text not null,
  body text not null,
  delay_days int not null default 0,
  condition text default 'always', -- always|opened|clicked|no_reply
  created_at timestamptz default now()
);
```

#### `sequence_enrollments`
```sql
create table public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.sequences(id) on delete cascade,
  email citext not null,
  current_step int default 0,
  last_sent timestamptz,
  created_at timestamptz default now(),
  unique(sequence_id, email)
);
```

## API Endpoints

### Sequence Management

#### `GET /api/sequences`
List all sequences for the authenticated user.

#### `POST /api/sequences`
Create a new sequence.

#### `GET /api/sequences/[id]/steps`
Get all steps for a specific sequence.

#### `POST /api/sequences/[id]/steps`
Add a new step to a sequence.

### Contact Enrollment

#### `POST /api/sequences/[id]/enroll`
Enroll contacts in a sequence.

**Request Body:**
```json
{
  "emails": ["contact1@example.com", "contact2@example.com"]
}
```

#### `GET /api/sequences/[id]/enroll`
Get all enrollments for a sequence.

### Sequence Execution

#### `POST /api/sequences/run`
Run the sequence scheduler to process due steps.

## RPC Functions

### `due_sequence_steps()`
Returns all sequence steps that are due to be sent based on:
- Contact enrollment status
- Delay timing
- Behavioral conditions

### `mark_sequence_step_sent(step_id, email)`
Marks a sequence step as sent and advances the contact to the next step.

## Condition Logic

### Available Conditions

1. **`always`** - Send regardless of behavior
2. **`opened`** - Only send if previous email was opened
3. **`clicked`** - Only send if previous email was clicked
4. **`no_reply`** - Only send if no reply was received

### How Conditions Work

- Conditions are checked against the `events` table
- If a condition is not met, the step is skipped
- The contact advances to the next step automatically
- This prevents spam and ensures relevant follow-ups

## Usage Examples

### Creating a Drip Campaign

1. **Create Sequence:**
```bash
POST /api/sequences
{
  "name": "Welcome Drip Campaign"
}
```

2. **Add Steps:**
```bash
POST /api/sequences/{id}/steps
{
  "subject": "Welcome!",
  "body": "Thanks for signing up...",
  "delay_days": 0,
  "condition": "always"
}

POST /api/sequences/{id}/steps
{
  "subject": "Getting Started Guide",
  "body": "Here's how to get started...",
  "delay_days": 3,
  "condition": "opened"
}
```

3. **Enroll Contacts:**
```bash
POST /api/sequences/{id}/enroll
{
  "emails": ["user@example.com"]
}
```

4. **Run Scheduler:**
```bash
POST /api/sequences/run
```

### Setting Up Cron

Add this to your cron configuration to run sequences every hour:

```bash
0 * * * * curl -X POST https://yourdomain.com/api/sequences/run
```

## Testing

### Manual Testing

1. Create a sequence with 2-3 steps
2. Enroll a test contact
3. Run `/api/sequences/run` manually
4. Check that step 1 sends
5. Wait for delay period
6. Run again to see step 2 send
7. Test conditions by adding events

### Test Data

Use the test script to create sample sequences:
```bash
npm run test:sequences
```

## Benefits

### For Users
- **Automated follow-ups** without manual intervention
- **Smart targeting** based on engagement
- **Professional drip campaigns** with proper timing
- **Reduced churn** through consistent communication

### For Business
- **Increased engagement** through relevant messaging
- **Better conversion rates** with timed follow-ups
- **Reduced manual work** for sales teams
- **Scalable outreach** to large contact lists

## Future Enhancements

- **A/B testing** for sequence steps
- **Advanced conditions** (time-based, custom events)
- **Sequence templates** for common use cases
- **Analytics dashboard** for sequence performance
- **Integration** with CRM systems

## Troubleshooting

### Common Issues

1. **Steps not sending**: Check delay_days and conditions
2. **Contacts not progressing**: Verify events table has correct data
3. **Permission errors**: Ensure RLS policies are correct
4. **Email delivery**: Check email service configuration

### Debug Queries

```sql
-- Check due steps
SELECT * FROM due_sequence_steps();

-- View enrollments
SELECT * FROM sequence_enrollments WHERE sequence_id = 'your-sequence-id';

-- Check step conditions
SELECT * FROM sequence_steps WHERE sequence_id = 'your-sequence-id' ORDER BY step_number;
```

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own sequences
- API endpoints validate user ownership
- Email addresses are normalized and validated

## Performance

- Indexes on frequently queried columns
- Efficient RPC functions for batch processing
- Pagination for large result sets
- Background processing for email sending 