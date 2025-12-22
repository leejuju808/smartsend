# Auto-Stop on Reply Implementation

This document describes the implementation of the auto-stop on reply feature for SmartSend AI campaigns.

## Overview

The auto-stop on reply feature automatically stops sending future emails to recipients who have replied to any email in a campaign. This prevents spam complaints and improves sender reputation by respecting recipient engagement.

## Features

- **Campaign-level toggle**: Each campaign can enable/disable auto-stop on reply
- **Real-time processing**: Replies are processed immediately via webhook
- **Belt & suspenders**: Double-check during send to prevent race conditions
- **Analytics preservation**: Reply events are logged for tracking
- **Performance optimized**: Fast database functions with proper indexing

## Database Changes

### New Columns

```sql
-- Add to both campaigns and campaigns_new tables
alter table public.campaigns add column if not exists auto_stop_on_reply boolean default true;
alter table public.campaigns_new add column if not exists auto_stop_on_reply boolean default true;
```

### New Functions

#### `mark_replied_and_skip(p_campaign uuid, p_email text)`
Marks all pending recipients for a specific campaign+email as skipped with reason "auto_stopped_on_reply".

#### `sync_replies_to_recipients(p_campaign uuid)`
Syncs reply events to recipient statuses, ensuring no pending emails are sent to people who have replied.

### Indexes

```sql
create index if not exists idx_campaigns_auto_stop_on_reply on public.campaigns(auto_stop_on_reply);
create index if not exists idx_campaigns_new_auto_stop_on_reply on public.campaigns_new(auto_stop_on_reply);
```

## API Endpoints

### 1. Inbound Reply Webhook

**Endpoint**: `POST /api/inbound/reply`

**Purpose**: Processes inbound reply emails and automatically stops future sends

**Request Body**:
```json
{
  "campaign_id": "uuid",
  "from": "recipient@example.com"
}
```

**Response**:
```json
{
  "ok": true,
  "autoStopped": true
}
```

**Flow**:
1. Records reply event in events table
2. Checks campaign auto_stop_on_reply setting
3. If enabled, calls `mark_replied_and_skip()` function
4. Returns success with auto-stop status

### 2. Toggle Auto-Stop Setting

**Endpoint**: `POST /api/campaigns/[id]/toggle-auto-stop`

**Purpose**: Enables/disables auto-stop on reply for a specific campaign

**Request Body**:
```json
{
  "enabled": true
}
```

**Response**:
```json
{
  "ok": true,
  "auto_stop_on_reply": true
}
```

### 3. Enhanced Send-Chunk Endpoint

**Endpoint**: `POST /api/campaigns/[id]/send-chunk`

**Enhancement**: Added auto-stop check before sending

```typescript
// Auto-stop on reply: Clean up any 'pending' rows that already have a reply event
if (campaign.auto_stop_on_reply) {
  await supabase.rpc("sync_replies_to_recipients", { p_campaign: id });
}
```

## UI Components

### AutoStopToggle Component

Located at `src/components/campaign/AutoStopToggle.tsx`

**Features**:
- Checkbox toggle for auto-stop setting
- Real-time API updates
- Toast notifications for success/error
- Loading states
- Callback support for parent components

**Usage**:
```tsx
<AutoStopToggle
  campaignId="uuid"
  initialValue={true}
  onToggle={(enabled) => console.log('Auto-stop:', enabled)}
/>
```

## Implementation Steps

### 1. Database Migration

Run the migration file:
```bash
psql -h your-db-host -U postgres -d your-db-name -f supabase/migrations/20250127_add_auto_stop_on_reply.sql
```

### 2. Deploy API Endpoints

The following endpoints are automatically deployed:
- `/api/inbound/reply` - Inbound reply webhook
- `/api/campaigns/[id]/toggle-auto-stop` - Toggle auto-stop setting

### 3. Update Send Engine

The send-chunk endpoint automatically includes auto-stop logic.

### 4. Add UI Components

Include the `AutoStopToggle` component in your campaign editor pages.

## Testing

### Database Functions

Test the helper functions directly:

```sql
-- Test mark_replied_and_skip
select public.mark_replied_and_skip('campaign-uuid', 'test@example.com');

-- Test sync_replies_to_recipients
select public.sync_replies_to_recipients('campaign-uuid');
```

### API Testing

Use the test script:
```bash
npx tsx scripts/test-auto-stop.ts
```

### Manual Testing

1. Create a campaign with auto-stop enabled
2. Send emails to test recipients
3. Simulate a reply via the webhook
4. Verify future sends are skipped
5. Check analytics show reply events

## Configuration

### Email Provider Setup

Configure your email provider to send reply webhooks to:
```
POST https://yourdomain.com/api/inbound/reply
```

**Required Headers**:
- `Content-Type: application/json`
- `X-Campaign-Id: {campaign_id}` (if not in body)

**Webhook Payload**:
```json
{
  "campaign_id": "uuid",
  "from": "recipient@example.com",
  "message_id": "unique-message-id",
  "subject": "Re: Original Subject"
}
```

### Default Behavior

- New campaigns default to `auto_stop_on_reply: true`
- Existing campaigns maintain their current behavior
- Can be toggled per campaign

## Monitoring & Analytics

### Events Table

Reply events are logged with:
- `campaign_id`: Associated campaign
- `recipient_email`: Who replied
- `type`: "reply"
- `user_agent`: Reply client info
- `ip`: Reply source IP

### Auto-Stop Events

When auto-stop is triggered:
- Recipient status changes to "skipped"
- Error field set to "auto_stopped_on_reply"
- Timestamp recorded

### Dashboard Integration

The existing campaign progress endpoints automatically include skipped counts from auto-stop events.

## Performance Considerations

### Database Optimization

- Functions use indexed lookups
- Batch operations minimize round trips
- Proper RLS policies ensure security

### Webhook Processing

- Fast response times (<100ms)
- Non-blocking event logging
- Graceful error handling

### Send Engine

- Auto-stop check runs once per send-chunk
- Minimal overhead for enabled campaigns
- No impact for disabled campaigns

## Security

### Row Level Security

All database operations respect RLS policies:
- Users can only access their own campaigns
- Service role key used for webhook processing
- Input validation on all endpoints

### Webhook Security

- Validate campaign_id ownership
- Sanitize email addresses
- Rate limiting recommended
- IP whitelisting for providers

## Troubleshooting

### Common Issues

1. **Webhook not receiving replies**
   - Check email provider configuration
   - Verify endpoint URL is correct
   - Check server logs for errors

2. **Auto-stop not working**
   - Verify campaign has `auto_stop_on_reply: true`
   - Check database functions exist
   - Verify events table has reply records

3. **Performance issues**
   - Check database indexes are created
   - Monitor function execution times
   - Consider batch size adjustments

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=auto-stop:*
```

## Future Enhancements

### Planned Features

1. **Reply Intent Classification**: AI-powered reply categorization
2. **Smart Suppression**: Automatic suppression based on reply content
3. **Engagement Scoring**: Track reply patterns for lead scoring
4. **Meeting Detection**: Auto-create tasks for meeting requests

### Integration Points

1. **CRM Systems**: Sync reply events to contact records
2. **Analytics**: Enhanced reply tracking and reporting
3. **Automation**: Trigger workflows based on reply types
4. **Team Collaboration**: Notify team members of replies

## Support

For questions or issues with the auto-stop implementation:

1. Check this documentation
2. Review server logs for errors
3. Test with the provided test script
4. Contact the development team

## Changelog

- **2025-01-27**: Initial implementation
  - Database migration and functions
  - API endpoints for webhook and toggle
  - UI component for campaign settings
  - Integration with send engine 