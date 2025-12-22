# Email Sequences System

## Overview
The Email Sequences system allows users to create multi-step email campaigns with smart conditions and delays. This is a powerful outbound tool that helps build drip campaigns and improve user engagement.

## Features

### Core Functionality
- **Multi-step sequences**: Create campaigns with multiple emails
- **Smart delays**: Set delays between steps (e.g., Day 0, Day 3, Day 7)
- **Behavioral conditions**: Adapt based on recipient behavior:
  - `always`: Send regardless of behavior
  - `opened`: Only send if previous email was opened
  - `clicked`: Only send if previous email was clicked
  - `no_reply`: Only send if no reply was received

### Database Schema

#### Tables
1. **`sequences`**: Container for email sequences
   - `id`: Unique identifier
   - `name`: Sequence name
   - `created_by`: User who created the sequence
   - `created_at`, `updated_at`: Timestamps

2. **`sequence_steps`**: Individual emails within a sequence
   - `id`: Unique identifier
   - `sequence_id`: Reference to parent sequence
   - `step_order`: Order within sequence
   - `subject`: Email subject line
   - `body_text`: Plain text email body
   - `body_html`: HTML email body (optional)
   - `delay_days`: Days to wait after previous step
   - `condition`: Behavioral condition for sending

3. **`sequence_enrollments`**: Tracks who is enrolled in which sequence
   - `id`: Unique identifier
   - `sequence_id`: Reference to sequence
   - `email`: Recipient email
   - `current_step`: Current step in sequence
   - `last_sent`: When last email was sent

#### Database Functions
- **`due_sequence_steps()`**: Finds steps ready to be sent
- **`mark_sequence_step_sent()`**: Advances a contact to the next step

## API Endpoints

### Sequences
- `GET /api/sequences` - List all sequences
- `POST /api/sequences` - Create new sequence

### Sequence Steps
- `GET /api/sequences/[id]/steps` - Get steps for a sequence
- `POST /api/sequences/[id]/steps` - Add step to sequence

### Sequence Runner
- `POST /api/sequences/run` - Execute due sequence steps

## Usage

### Creating a Sequence
1. Navigate to Pipeline page
2. Click "Create New Sequence"
3. Enter sequence name
4. Add steps with subject, body, delay, and conditions

### Example Sequence
```
Step 1: Welcome email (Day 0, always)
Step 2: Follow-up (Day 3, only if opened)
Step 3: Final attempt (Day 7, only if no reply)
```

### Testing
- Use the "Test Runner" button to manually execute sequences
- Check the console for execution results

## Setup

### Database Migration
Run the SQL migration file:
```sql
-- File: supabase/migrations/20241201000000_create_sequences.sql
```

### Environment Variables
Ensure these are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EMAIL_FROM`

## Cron Job Setup
To run sequences automatically, set up a cron job to call `/api/sequences/run`:

```bash
# Run every hour
0 * * * * curl -X POST https://yourdomain.com/api/sequences/run

# Or use a service like cron-job.org
```

## Business Value

### Why This is a 9/10 Move
1. **Outbound Power Tool**: Users can build real drip campaigns
2. **Smart Behavior**: Adapts based on recipient engagement
3. **Revenue Impact**: Sequences increase user stickiness and reduce churn
4. **Competitive Advantage**: Advanced email automation features

### Use Cases
- **Sales Outreach**: Multi-touch campaigns with smart follow-ups
- **Onboarding**: Welcome series with engagement tracking
- **Re-engagement**: Win-back campaigns for inactive users
- **Event Marketing**: Pre/post event communication

## Future Enhancements
- A/B testing for subject lines and content
- Advanced segmentation and targeting
- Analytics and performance metrics
- Template library for common sequences
- Integration with CRM systems 