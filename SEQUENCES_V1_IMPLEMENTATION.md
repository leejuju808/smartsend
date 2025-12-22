# SmartSend Sequences v1 Implementation

## Overview

SmartSend Sequences v1 is a comprehensive drip sequence system that turns contacts into scheduled conversations. It features multi-step drip sequences with per-step wait rules, send windows, templating, and **stop-on-reply** functionality.

## Features

- **Multi-step sequences** with configurable delays between steps
- **Send windows** to respect business hours and days
- **Template engine** with contact and sequence variables
- **Stop-on-reply** automatically pauses sequences when contacts reply
- **Throttling** to control sending volume per sequence
- **Integration** with existing contacts, suppression, and deliverability systems

## Architecture

### Database Schema

The system uses four main tables:

1. **`sequences`** - Sequence configuration and settings
2. **`sequence_steps`** - Individual steps with templates and delays
3. **`sequence_subscribers`** - Contact enrollment and progress tracking
4. **`sequence_events`** - Audit trail of all sequence activities

### Key Components

- **Template Engine** (`/lib/sequences/template.ts`) - Renders templates with variables
- **Send Window Helper** (`/lib/sequences/window.ts`) - Manages business hours and days
- **Progressor** (`/lib/sequences/progress.ts`) - Advances subscribers through steps
- **API Routes** - Create, enroll, and manage sequences
- **Scheduler** - Cron-based tick system for processing due emails

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local`:

```env
NEXT_PUBLIC_DEMO_WORKSPACE_ID=your_workspace_uuid_here
SEQUENCES_CRON_SECRET=superlongrandomsecretkeyhere
DEFAULT_TIMEZONE=America/Los_Angeles
```

### 2. Database Migration

Run the SQL migration in your Supabase SQL editor:

```sql
-- Run the contents of supabase/migrations/20250128_sequences_v1_implementation.sql
```

### 3. Cron Job Setup

Set up a cron job to run every 5 minutes:

```bash
*/5 * * * * curl -X POST "https://yourdomain.com/api/sequences/tick?workspaceId=YOUR_UUID&secret=SEQUENCES_CRON_SECRET"
```

## Usage

### Creating a Sequence

```bash
curl -X POST http://localhost:3000/api/sequences/save \
  -H 'Content-Type: application/json' \
  -d '{
    "workspaceId":"YOUR_UUID",
    "sequence": {
      "name":"Intro → Nudge → Close", 
      "timezone":"America/Los_Angeles", 
      "stop_on_reply": true,
      "send_window": {"days":[1,2,3,4,5], "start_hour":9, "end_hour":17}, 
      "throttle_per_tick": 40 
    },
    "steps": [
      {
        "step_no":1, 
        "wait_seconds":0, 
        "subject_template":"Quick hello, {{contact.first_name}}", 
        "text_template":"{{contact.first_name}}, saw you were hiring SDRs – worth a 7‑min intro?"
      },
      {
        "step_no":2, 
        "wait_seconds":172800, 
        "subject_template":"Any interest?", 
        "text_template":"Bumping this – 7‑min intro?"
      },
      {
        "step_no":3, 
        "wait_seconds":432000, 
        "subject_template":"Should I close the loop?", 
        "text_template":"If now isn't right I'll close the loop. Otherwise here's a slot: {{sequence.calendly||''}}"
      }
    ]
  }'
```

### Enrolling Contacts

```bash
curl -X POST http://localhost:3000/api/sequences/enroll \
  -H 'Content-Type: application/json' \
  -d '{
    "workspaceId":"YOUR_UUID",
    "sequenceId":"SEQUENCE_UUID",
    "contactIds":["CONTACT_UUID_1", "CONTACT_UUID_2"]
  }'
```

### Quick Enrollment via UI

Visit `/dashboard/sequences` and use the "Quick Enroll 50 recent" button to automatically enroll recent contacts.

## Template Variables

The template engine supports these variables:

- `{{contact.first_name}}` - Contact's first name
- `{{contact.last_name}}` - Contact's last name
- `{{contact.email}}` - Contact's email
- `{{contact.company}}` - Contact's company
- `{{sequence.name}}` - Sequence name
- `{{step.step_no}}` - Current step number

## Send Windows

Send windows control when emails can be sent:

```json
{
  "days": [1, 2, 3, 4, 5],  // Monday to Friday
  "start_hour": 9,           // 9 AM
  "end_hour": 17             // 5 PM
}
```

## Stop-on-Reply

When a contact replies to any sequence email, the system automatically:

1. Pauses the subscriber's sequence
2. Records a "replied" event
3. Prevents further emails from that sequence

This is handled by the inbound email webhook integration.

## Monitoring

### Sequence Events

All sequence activities are logged in `sequence_events`:

- `enrolled` - Contact enrolled in sequence
- `sent` - Email sent for a step
- `completed` - Sequence finished
- `paused` - Sequence paused (e.g., due to reply)
- `replied` - Contact replied (stops sequence)

### Dashboard

Visit `/dashboard/sequences` to see:

- All sequences with their settings
- Subscriber counts by status
- Quick enrollment options

## Integration Points

### Existing Systems

- **Contacts** - Uses existing contact database
- **Suppression** - Integrates with suppression lists
- **Deliverability** - Uses existing sending guardrails
- **Warm-up** - Respects domain warm-up limits
- **Inbound** - Automatically stops sequences on replies

### Email Sending

Sequences use the existing `reserveAndSend` function which:

- Checks warm-up limits
- Respects bounce rate thresholds
- Applies domain and global caps
- Records sending audit logs

## Troubleshooting

### Common Issues

1. **Emails not sending** - Check cron job is running and `SEQUENCES_CRON_SECRET` is correct
2. **Templates not rendering** - Verify template syntax uses `{{variable}}` format
3. **Stop-on-reply not working** - Ensure inbound webhook is properly configured
4. **High bounce rates** - Check sequence content and contact quality

### Debugging

- Check sequence events table for activity logs
- Monitor cron job logs for tick processing
- Verify environment variables are set correctly
- Check RLS policies are working with `app.set_workspace`

## Future Enhancements

- Real timezone math with DST support
- A/B testing per step
- Auto-skip weekends/holidays
- Unsubscribe tokenized links
- Per-sequence analytics and conversion tracking

## Security

- All database operations use RLS with workspace scoping
- API routes require proper authentication
- Cron endpoints use secret-based authorization
- No sensitive data exposed in templates

## Performance

- Indexes on key query patterns
- Throttling prevents overwhelming email providers
- Efficient subscriber processing with batching
- Minimal database queries per operation

---

**Ready to scale your follow-ups!** 🚀

Sequences v1 gives you repeatable revenue loops with polite, automated follow-ups that stop the moment a human replies. 