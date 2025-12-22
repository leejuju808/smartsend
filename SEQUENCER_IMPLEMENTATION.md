# SmartSend Sequencer Implementation

## Overview

The SmartSend Sequencer is a production-ready sequence engine that allows campaigns to have multiple steps (e.g., Day 0 / Day 3 / Day 7) with automatic progression and intelligent stopping on replies/unsubscribes.

## Features

- **Multi-step campaigns**: D0/D3/D7 follow-ups with configurable delays
- **Auto-stop on reply**: Stops sequence when contact replies
- **Auto-stop on unsubscribe**: Stops sequence when contact unsubscribes
- **Safe pacing and jitter**: Prevents spam flags with intelligent timing
- **Clean queue lifecycle**: Automatic progression through steps
- **Plan-gated sending**: Uses existing subscription status
- **Personalization**: Support for {{name}}, {{company}}, {{email}} variables

## Database Schema

### New Tables

#### `campaign_steps`
```sql
create table public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_index int not null, -- 0, 1, 2, etc.
  subject text not null,
  body_html text not null,
  delay_days int not null default 0, -- days after previous step
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Ensure unique step per campaign
  unique(campaign_id, step_index)
);
```

#### Extended `campaigns` table
```sql
-- Add sequence-related columns
alter table public.campaigns 
  add column if not exists is_sequence boolean default false;
alter table public.campaigns 
  add column if not exists current_step int default 0;
alter table public.campaigns 
  add column if not exists last_sent_step int default -1;
alter table public.campaigns 
  add column if not exists next_eligible_at timestamptz;
```

#### Extended `campaign_recipients` table
```sql
-- Add step tracking
alter table public.campaign_recipients 
  add column if not exists step_index int default 0;
alter table public.campaign_recipients 
  add column if not exists last_sent_step int default -1;
alter table public.campaign_recipients 
  add column if not exists next_eligible_at timestamptz;
```

### Database Functions

#### `get_next_campaign_step(campaign_id, current_step)`
Returns the next step index for a campaign, or -1 if no more steps.

#### `compose_step_email(campaign_id, contact_id, step_index)`
Returns the subject and body for a specific step, ready for personalization.

## API Endpoints

### 1. Campaign Steps Management

#### `POST /api/campaigns/steps/upsert`
Creates or updates campaign steps.

**Request Body:**
```json
{
  "campaign_id": "uuid",
  "steps": [
    {
      "step_index": 0,
      "subject": "Initial Outreach - {{company}}",
      "body_html": "<p>Hi {{name}}...</p>",
      "delay_days": 0
    },
    {
      "step_index": 1,
      "subject": "Following up - {{company}}",
      "body_html": "<p>Hi {{name}}...</p>",
      "delay_days": 3
    }
  ]
}
```

#### `GET /api/campaigns/steps/list?campaign_id=uuid`
Lists all steps for a campaign.

### 2. Campaign Queueing

#### `POST /api/campaigns/queue`
Queues contacts to a campaign with step support.

**Request Body:**
```json
{
  "campaign_id": "uuid",
  "contacts": [
    { "id": "uuid", "email": "email@example.com", "name": "Name" }
  ],
  "step_index": 0
}
```

**Features:**
- Plan-gated limits (Free: 100, Pro: 10k)
- Safe pacing with jitter (Free: 0-30min, Pro: 0-5min)
- Automatic step assignment

### 3. Inbound Processing

#### `POST /api/inbound`
Handles inbound replies and automatically purges future sequence sends.

**Auto-stop triggers:**
- Email reply detection (via In-Reply-To, References headers)
- Unsubscribe processing
- Bounce handling

## Cron Sender Updates

The existing cron sender (`/api/cron/campaigns`) has been enhanced to:

1. **Detect sequence campaigns**: Checks `is_sequence` flag
2. **Send step-specific content**: Uses `campaign_steps` table
3. **Auto-advance steps**: Schedules next step after delay
4. **Queue management**: Re-queues recipients for next steps
5. **Campaign completion**: Marks campaign done when all steps sent

### Step Progression Logic

```typescript
// After successful send
if (camp.is_sequence) {
  // Find next step
  const nextStep = await getNextStep(campaignId, currentStep);
  
  if (nextStep) {
    // Calculate next send time
    const nextSendAt = new Date();
    nextSendAt.setDate(nextSendAt.getDate() + nextStep.delay_days);
    
    // Add jitter (0-2 hours)
    const jitterMs = Math.random() * 2 * 60 * 60 * 1000;
    nextSendAt.setTime(nextSendAt.getTime() + jitterMs);
    
    // Re-queue for next step
    updateRecipient({
      step_index: nextStep.step_index,
      next_eligible_at: nextSendAt,
      status: 'queued'
    });
  }
}
```

## UI Components

### Campaign Steps Editor

**Location:** `/dashboard/campaigns/[id]/steps`

**Features:**
- Visual step builder with drag-and-drop reordering
- Subject and body editors for each step
- Delay configuration (days between steps)
- Variable support ({{name}}, {{company}}, {{email}})
- Real-time preview and validation
- Save/load campaign steps

### Campaign Page Integration

**Location:** `/dashboard/campaigns/[id]`

**Updates:**
- "Manage Steps" button linking to steps editor
- Sequence campaign indicators
- Step progress visualization
- Quick setup for D0/D3/D7 sequences

## Usage Flow

### 1. Create Campaign Steps

1. Navigate to campaign page
2. Click "Manage Steps"
3. Add steps with subjects, bodies, and delays
4. Save steps (automatically marks campaign as sequence)

### 2. Queue Contacts

1. Use `/api/campaigns/queue` endpoint
2. Specify campaign_id and contacts array
3. Contacts are queued for step 0 with pacing/jitter

### 3. Start Campaign

1. Set campaign status to "running"
2. Cron job automatically processes step 0
3. After each send, recipients are re-queued for next step
4. Steps progress automatically based on delays

### 4. Auto-stop on Engagement

- **Reply detected**: Future sends purged immediately
- **Unsubscribe**: Future sends purged immediately
- **Bounce**: Future sends purged immediately

## Testing

### Test Script

Run the sequencer test:

```bash
npm run test:sequencer
```

This creates:
- Test campaign with 3 steps (D0/D3/D7)
- Test contacts
- Queued recipients
- Started campaign

### Manual Testing

1. **Setup**: Create campaign with steps via UI
2. **Queue**: Add contacts via API
3. **Start**: Set campaign to running
4. **Monitor**: Watch cron logs for step progression
5. **Test Reply**: Send reply to trigger auto-stop
6. **Verify**: Check that future sends are purged

## Configuration

### Environment Variables

```env
# Required for email sending
RESEND_API_KEY=your_resend_key
RESEND_FROM=from@yourdomain.com

# Required for tracking
EVENTS_SIGNING_SECRET=your_signing_secret
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# Required for cron
CRON_SECRET=your_cron_secret
```

### Plan Limits

- **Free Plan**: 100 contacts, 0-30min jitter, 5s pacing
- **Pro Plan**: 10k contacts, 0-5min jitter, 1s pacing

## Monitoring & Debugging

### Key Metrics

- `campaigns.current_step`: Current step being processed
- `campaigns.last_sent_step`: Last step that was sent
- `campaign_recipients.step_index`: Current step for each recipient
- `campaign_recipients.next_eligible_at`: When next send is scheduled

### Log Locations

- **Cron logs**: Check cron job execution logs
- **Email events**: `email_events` table for tracking
- **Campaign progress**: `campaigns` table for status
- **Recipient state**: `campaign_recipients` table for individual progress

### Common Issues

1. **Steps not progressing**: Check cron job execution
2. **Emails not sending**: Verify email provider configuration
3. **Future sends not purged**: Check inbound webhook setup
4. **Personalization not working**: Verify contact data structure

## Next Steps

### Planned Enhancements

1. **Per-domain throttling**: Rate limiting by sender domain
2. **Time-of-day windows**: Send at optimal times per step
3. **Conditional branches**: Different content based on engagement
4. **A/B testing**: Test subjects and content per step
5. **Team workspace scoping**: Multi-user campaign management

### Integration Points

- **CRM systems**: Salesforce, HubSpot contact sync
- **Email providers**: Resend, SendGrid, Mailgun
- **Analytics**: Reply intent detection, engagement scoring
- **Automation**: Zapier, Make.com webhooks

## Support

For questions or issues with the sequencer:

1. Check the logs for error messages
2. Verify database schema is up to date
3. Test with the provided test script
4. Review environment variable configuration

The sequencer is designed to be robust and self-healing, automatically handling edge cases and maintaining data consistency. 