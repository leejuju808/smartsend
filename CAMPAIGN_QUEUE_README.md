# Campaign Queue Builder

This system provides personalization and rate limiting for email campaigns with template rendering and scheduled sending.

## Features

- **Template Rendering**: Uses `{{variable}}` syntax with fallback support (`{{variable||Fallback}}`)
- **Rate Limiting**: Respects daily caps and send windows
- **Scheduling**: Automatically schedules emails within business hours
- **Suppression**: Automatically skips suppressed emails
- **Queue Processing**: Background processing of scheduled emails

## Database Schema

The system adds these fields to the `campaigns` table:
- `subject_template`: Email subject template
- `body_template`: Email body template  
- `daily_cap`: Maximum emails per day (default: 200)
- `cadence_seconds`: Gap between emails (default: 45)
- `window_start`: Send window start time (default: 08:00)
- `window_end`: Send window end time (default: 17:30)
- `start_date`: Campaign start date

And creates these tables:
- `send_queue`: Queued emails with rendered content
- `campaign_targets`: Links campaigns to leads

## Usage

### 1. Set up Campaign Templates

```sql
UPDATE campaigns 
SET 
  subject_template = 'Hi {{first_name||there}}, interested in {{company}}?',
  body_template = '<p>Hi {{first_name||there}},</p><p>I noticed you work at {{company}}...</p>',
  daily_cap = 100,
  cadence_seconds = 60,
  window_start = '09:00',
  window_end = '17:00'
WHERE id = 'your-campaign-id';
```

### 2. Add Campaign Targets

```sql
INSERT INTO campaign_targets (campaign_id, lead_id)
SELECT 'your-campaign-id', id 
FROM leads 
WHERE workspace_id = 'your-workspace-id';
```

### 3. Build Queue

Use the React component or API endpoint:

```tsx
<QueueBuilder campaignId="your-campaign-id" />
```

Or call the API directly:

```bash
POST /api/campaigns/your-campaign-id/queue
```

### 4. Process Queue

Set up a cron job to call:

```bash
POST /api/cron/process-queue
Authorization: Bearer YOUR_CRON_SECRET
```

## Template Variables

Available variables in templates:
- `{{first_name}}` - Lead's first name
- `{{last_name}}` - Lead's last name  
- `{{company}}` - Lead's company
- `{{title}}` - Lead's job title
- `{{lead.email}}` - Lead's email
- `{{lead.custom.field}}` - Custom fields

Use fallback syntax: `{{first_name||there}}` will show "there" if first_name is empty.

## Rate Limiting

The system automatically:
- Respects daily caps per campaign
- Schedules emails within business hours
- Maintains cadence between sends
- Skips suppressed emails
- Rolls over to next day when daily cap is reached

## Monitoring

Check queue status:

```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(scheduled_at) as next_send,
  MAX(scheduled_at) as last_send
FROM send_queue 
WHERE campaign_id = 'your-campaign-id'
GROUP BY status;
```