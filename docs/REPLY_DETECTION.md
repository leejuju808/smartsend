# Automatic Reply Detection for Campaigns

This document explains how the automatic reply detection system works for campaign emails.

## Overview

When leads reply to campaign emails, their status is automatically updated to `'Replied'` in Supabase. This triggers the existing database trigger `cancel_future_sends_on_reply()` which automatically pauses all future follow-up sequences for that lead.

## Architecture

### Components

1. **`src/lib/email/replyDetection.ts`** - Core logic for detecting replies
2. **`src/app/api/campaigns/[id]/check-replies/route.ts`** - API endpoint to manually trigger reply checks
3. **`src/app/api/cron/check-replies/route.ts`** - Automated cron job for periodic reply detection

### Database Trigger

The system leverages an existing database trigger defined in `supabase/migrations/20251025_stop_followups_when_replied.sql`:

```sql
create or replace function public.cancel_future_sends_on_reply()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'replied' and old.status is distinct from 'replied') then
    update public.send_queue sq
       set status = 'canceled',
           last_error = 'Auto-canceled because lead replied at ' || coalesce(new.replied_at, now())::text
     where sq.lead_id = new.id
       and sq.status = 'pending'
       and sq.scheduled_at > now();
  end if;
  return new;
end $$;

create trigger trg_cancel_future_sends_on_reply
after update of status, replied_at on public.leads
for each row execute function public.cancel_future_sends_on_reply();
```

This trigger automatically cancels all pending sends when a lead's status changes to `'replied'`.

## How It Works

### Reply Detection Process

1. **Fetch Gmail Credentials**: The system retrieves Gmail OAuth tokens from the `mailboxes` table
2. **Get Campaign Leads**: Retrieves all leads for the specified campaign that haven't replied yet
3. **Retrieve Thread IDs**: Looks up Gmail thread IDs from the `email_logs` table
4. **Check Gmail Threads**: For each thread, checks if there's a reply from someone other than the sender
5. **Update Lead Status**: Marks leads as `'Replied'` and sets `replied_at` timestamp
6. **Automatic Pause**: The database trigger pauses all future sends automatically

### Key Features

- ✅ **Works with existing infrastructure**: Uses Gmail API through existing OAuth setup
- ✅ **Automatic sequence pausing**: Database trigger handles stopping follow-ups
- ✅ **Thread-based detection**: Uses Gmail thread IDs to detect replies
- ✅ **Prevents duplicate checks**: Only checks leads that haven't replied yet
- ✅ **Error resilient**: Individual failures don't stop the entire process

## Usage

### Manual Reply Check for a Campaign

```typescript
import { checkRepliesForCampaign } from '@/lib/email/replyDetection';

// Check replies for a specific campaign
const repliedEmails = await checkRepliesForCampaign(campaignId, ownerId);
console.log(`${repliedEmails.length} leads marked as replied`);
```

### Via API Endpoint

```bash
# Check replies for a specific campaign
POST /api/campaigns/{campaignId}/check-replies
Headers:
  Authorization: Bearer {token}
  x-user-id: {userId}

Response:
{
  "success": true,
  "campaignId": "...",
  "repliedCount": 5,
  "repliedEmails": ["lead1@example.com", "lead2@example.com", ...]
}
```

### Automated Cron Job

Set up a cron job to call:

```
GET /api/cron/check-replies
Headers:
  x-cron-secret: {CRON_SECRET}
```

This will automatically check replies for all active campaigns across all Gmail-connected users.

### Check All Campaigns for a User

```typescript
import { checkRepliesForAllCampaigns } from '@/lib/email/replyDetection';

const result = await checkRepliesForAllCampaigns(ownerId);
console.log(`Checked ${result.campaignsChecked} campaigns, ${result.leadsReplied} leads replied`);
```

## Detection Logic

A lead is considered to have replied when:

1. A message exists in the Gmail thread (identified by `thread_id`)
2. The message is sent **from someone other than** the sender (the lead themselves)
3. The message has reply headers (`In-Reply-To` or `References`)
4. The message is not from the sending mailbox

This prevents false positives from:
- Out-of-office messages (if they come from the original sender)
- Bounce messages
- Forwarded messages

## Environment Variables

Required environment variables:

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URL=your_redirect_url
CRON_SECRET=your_secret_key  # Optional, for securing cron endpoints
```

## Database Schema

### Leads Table

```sql
leads (
  id uuid primary key,
  email text,
  campaign_id uuid,
  status text,  -- 'Active', 'Replied', 'Bounced', etc.
  replied_at timestamptz,
  ...
)
```

### Email Logs Table

```sql
email_logs (
  id uuid primary key,
  campaign_id uuid,
  lead_id uuid,
  thread_id text,  -- Gmail thread ID
  message_id text,
  status text,
  replied_at timestamptz,
  ...
)
```

## Error Handling

- ✅ Missing Gmail credentials → Gracefully skips that mailbox
- ✅ Invalid refresh token → Logs error and continues with other mailboxes
- ✅ Gmail API rate limits → Individual failures logged, process continues
- ✅ Network errors → Caught and logged per lead

## Performance Considerations

- **Batch Size**: Defaults to checking up to 200 Gmail threads per campaign
- **Rate Limiting**: Respects Gmail API quotas (250 quota units per second)
- **Caching**: Thread IDs are cached in memory during each campaign check
- **Frequency**: Recommended to run cron job every 15-30 minutes

## Integration with Existing Systems

This system integrates with:

- **Gmail PubSub webhook** (`supabase/functions/gmail-pubsub/index.ts`) - Real-time reply detection
- **Reply classification** (`src/lib/ai/classifyReply.ts`) - AI-based intent detection
- **Sequence system** - Automatically pauses sequences when leads reply
- **Email logging** - Logs replies in `email_logs` table

## Testing

To test the reply detection manually:

```bash
# Test for a specific campaign
curl -X POST http://localhost:3000/api/campaigns/{campaignId}/check-replies \
  -H "Authorization: Bearer {token}" \
  -H "x-user-id: {userId}"
```

## Monitoring

Check logs for:
- `✅ Marked lead X as replied` - Successful updates
- `❌ Failed to update lead X` - Update failures
- `Error checking thread` - Gmail API issues

## Future Enhancements

- [ ] Support for Outlook/Office 365
- [ ] Real-time webhook integration for instant detection
- [ ] Reply intent classification
- [ ] Multi-language support for reply detection
- [ ] Webhook notifications when leads reply
