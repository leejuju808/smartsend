# Email Sequence System

A comprehensive email sequence automation system that allows users to create multi-step email campaigns with conditional advancement based on recipient engagement.

## Features

- **Multi-step sequences**: Create email sequences with multiple steps and custom timing
- **Conditional advancement**: Steps can advance based on recipient behavior (opens, clicks, no opens, etc.)
- **Template integration**: Use existing email templates or provide custom HTML/subject overrides
- **Event-driven processing**: Real-time advancement based on email events (opens, clicks, bounces)
- **Suppression handling**: Automatic suppression list checking
- **Campaign integration**: Sequences can be tied to campaigns for better organization

## Architecture

### Database Schema

The system uses three main tables:

1. **`sequences`**: Main sequence definitions
2. **`sequence_steps`**: Individual steps within sequences
3. **`sequence_enrollments`**: Per-recipient enrollment state and progress

### Components

1. **SQL Migration**: Database schema and RLS policies
2. **Supabase Edge Function**: Background scheduler that processes due enrollments
3. **Webhook Integration**: Event-driven advancement based on email events
4. **API Endpoints**: CRUD operations for sequences and enrollment management
5. **UI Components**: Sequence builder and enrollment interface

## Installation & Setup

### 1. Database Migration

Apply the database migration:

```bash
# The migration file is already created at:
# supabase/migrations/20250124_sequences.sql
```

### 2. Deploy Scheduler Function

Deploy the sequence scheduler function:

```bash
./scripts/deploy-sequence-scheduler.sh
```

This will:
- Deploy the `sequence-scheduler` Edge Function
- Set up a cron job to run every minute

### 3. Webhook Integration

The Resend webhook has been updated to handle sequence advancement. No additional setup required.

## Usage

### Creating a Sequence

1. Navigate to `/sequences-new`
2. Create a new sequence with a name
3. Add steps with:
   - Position (ordering)
   - Advance rule (always, if_no_open, if_no_click, if_open, if_click)
   - Wait time (seconds between steps)
   - Template ID or custom HTML/subject
4. Save the sequence

### Enrolling Recipients

1. Go to the sequence builder page
2. Use the "Enroll Test Contact" section
3. Provide:
   - Email address
   - Personalization variables (JSON format)
   - Start delay (seconds)

### API Endpoints

#### Sequences CRUD
- `GET /api/sequences-new` - List all sequences
- `POST /api/sequences-new` - Create new sequence

#### Steps Management
- `GET /api/sequences-new/[id]/steps` - Get sequence and steps
- `PUT /api/sequences-new/[id]/steps` - Update all steps

#### Enrollment
- `POST /api/sequences-new/[id]/enroll` - Enroll recipient(s)

## Advance Rules

The system supports five types of advance rules:

- **`always`**: Always advance to next step after wait time
- **`if_no_open`**: Only advance if email wasn't opened
- **`if_no_click`**: Only advance if email wasn't clicked
- **`if_open`**: Only advance if email was opened
- **`if_click`**: Only advance if email was clicked

## Event Processing

The system processes email events in real-time:

1. **Email Events**: Opens, clicks, bounces, deliveries are tracked
2. **Webhook Processing**: Resend webhook updates enrollment state
3. **Scheduler Processing**: Background function processes due enrollments
4. **Rule Evaluation**: Advance rules are evaluated against last events

## Monitoring

### Scheduler Function

The scheduler function logs:
- Number of enrollments processed
- Number of emails scheduled
- Any errors encountered

### Database Queries

Monitor sequence performance with these queries:

```sql
-- Active enrollments
SELECT COUNT(*) FROM sequence_enrollments WHERE status = 'active';

-- Enrollments due for processing
SELECT COUNT(*) FROM sequence_enrollments 
WHERE status = 'active' AND next_scheduled_at <= NOW();

-- Sequence completion rates
SELECT s.name, 
       COUNT(*) as total_enrollments,
       COUNT(*) FILTER (WHERE se.status = 'completed') as completed,
       COUNT(*) FILTER (WHERE se.status = 'active') as active
FROM sequences s
LEFT JOIN sequence_enrollments se ON s.id = se.sequence_id
GROUP BY s.id, s.name;
```

## Troubleshooting

### Common Issues

1. **Scheduler not running**: Check if the cron job is set up correctly
2. **Emails not sending**: Verify sequence is active and templates exist
3. **Advance rules not working**: Check email event processing in webhook logs

### Debugging

1. Check scheduler function logs in Supabase dashboard
2. Monitor email_events table for event processing
3. Review sequence_enrollments table for enrollment state

## Security

- Row Level Security (RLS) is enabled on all sequence tables
- Users can only access sequences from their workspace
- Service role has full access for background processing

## Performance Considerations

- Scheduler processes up to 200 enrollments per run
- Cron job runs every minute for near real-time processing
- Database indexes are optimized for common queries
- Template rendering is cached for performance