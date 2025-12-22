# SmartSend — Replies + Auto‑stop + Unsubscribe Center + Suppression (LIVE)

## Overview

This implementation provides a complete SmartSend system that scales to any number of contacts with the same workflow by closing the loop: detecting replies, stopping sequences automatically, classifying intent, honoring 1‑click unsubscribe, and enforcing suppressions at send‑time.

## What's Implemented

✅ **SQL Migration** - Complete database schema with RLS policies  
✅ **Reply Processing** - Inbound webhook handling with AI intent classification  
✅ **Auto-stop Logic** - Automatic sequence stopping on replies/unsubscribes  
✅ **1-click Unsubscribe** - Tokenized unsubscribe links with auto-suppression  
✅ **Unified Suppressions** - Bounces, complaints, unsubscribes, and manual suppressions  
✅ **Send-time Checks** - Suppression validation before sending  
✅ **UI Components** - Inbox for replies and Suppressions management  
✅ **API Routes** - Complete backend for all functionality  

## Quick Start

### 1. Run the SQL Migration

```bash
# Apply the migration to your Supabase database
psql -h your-db-host -U postgres -d your-db-name -f supabase/migrations/20250126_create_smartsend_replies_auto_stop_unsub_suppression.sql
```

### 2. Configure Your Email Provider

Point your inbound webhook to `/api/inbound`:

- **SES**: Configure SNS topic to POST to your endpoint
- **Mailgun**: Set webhook URL in Mailgun dashboard  
- **MailerSend**: Configure webhook in MailerSend settings

### 3. Test the System

Send a test email and reply to it. Verify:
- Reply appears in `/dashboard/inbox`
- Contact is marked as replied
- Future sequence steps are deleted
- Intent is classified (meeting, interested, etc.)

## Architecture

### Database Schema

```
inbound_messages     # Stores all inbound emails
├── message_id       # External provider message ID
├── in_reply_to      # References original message_id
├── from_email       # Sender email
├── to_email         # Recipient email
├── body_text        # Email content
└── provider         # 'ses', 'mailgun', 'mailersend'

unsubscribe_tokens   # 1-click unsubscribe tokens
├── token            # Unique token string
├── workspace_id     # Associated workspace
├── email_lower      # Contact email
├── campaign_id      # Optional campaign association
└── expires_at       # Token expiration

suppressions         # Unified suppression list
├── kind             # 'email' or 'domain'
├── value_lower      # Email or domain
├── source           # 'bounce', 'complaint', 'unsubscribe', 'manual'
└── metadata         # Additional context

reply_intents        # AI-classified reply intents
├── category         # 'meeting', 'interested', 'not_interested', 'question'
├── confidence       # 0.0-1.0 confidence score
└── actions          # Recommended actions

auto_stop_events     # Logs when sequences are auto-stopped
├── reason           # 'replied', 'unsubscribed', 'bounced', 'complained'
└── campaign_id      # Associated campaign
```

### Key Functions

- `stop_future_sends()` - Automatically stops sequences
- `is_contact_suppressed()` - Checks if email is suppressed
- `process_inbound_reply()` - Processes and classifies replies
- `cleanup_expired_unsubscribe_tokens()` - Removes old tokens

## API Endpoints

### Inbound Processing
- `POST /api/inbound` - Main webhook endpoint for all providers

### Unsubscribe Management  
- `POST /api/unsubscribe/[token]` - Process unsubscribe tokens
- `GET /api/inbox/replies` - Fetch recent replies
- `GET /api/inbox/stats` - Get reply statistics

### Suppression Management
- `GET /api/deliverability/suppressions` - List suppressions
- `GET /api/deliverability/suppressions/stats` - Suppression statistics

## Frontend Components

### Inbox Page (`/dashboard/inbox`)
- Shows all inbound replies with intent classification
- Displays confidence scores and recommended actions
- Links to contact and campaign information
- Quick filters by intent category

### Suppressions Page (`/dashboard/deliverability/suppressions`)
- Unified view of all suppressions (bounces, complaints, unsubscribes)
- Filter by source and type
- Shows auto-stop impact
- Bulk import/export capabilities

### Unsubscribe Page (`/u/[token]`)
- Clean, professional unsubscribe experience
- Shows campaign context if available
- Confirms successful unsubscribe

## Integration Points

### 1. Send Loop Patching

Add this to your existing cron job before sending:

```typescript
import { sendWithSuppressionCheck } from '../scripts/send-with-suppression-check';

// Before sending each email
const suppressionResult = await sendWithSuppressionCheck(
  workspaceId,
  campaignId,
  contactId,
  email
);

if (!suppressionResult.shouldSend) {
  console.log(`Skipping ${email}: ${suppressionResult.reason}`);
  continue;
}

// Include unsubscribe token in your email template
const unsubscribeUrl = `/u/${suppressionResult.unsubscribeToken}`;
```

### 2. Bounce/Complaint Webhooks

Patch your existing webhooks:

```typescript
import { handleBounceWebhook, handleComplaintWebhook } from '../scripts/send-with-suppression-check';

// In your bounce webhook
await handleBounceWebhook(workspaceId, email, 'hard', 'Invalid email');

// In your complaint webhook  
await handleComplaintWebhook(workspaceId, email, 'User marked as spam');
```

### 3. Email Templates

Add unsubscribe links to your templates:

```html
<!-- In your email template -->
<p>
  <a href="{{unsubscribe_url}}">Unsubscribe</a> | 
  <a href="mailto:{{from_email}}?subject=Unsubscribe">Unsubscribe via email</a>
</p>
```

## Configuration

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key

# Optional
INBOUND_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Webhook Security

The system supports webhook signature verification:

```typescript
// Set this environment variable
INBOUND_WEBHOOK_SECRET=your_secret_here

// The system will verify x-webhook-signature header
```

## Testing

### 1. Test Reply Processing

```bash
# Send a test webhook to /api/inbound
curl -X POST http://localhost:3000/api/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email.received",
    "data": {
      "id": "test-123",
      "from": "test@example.com", 
      "to": "your@domain.com",
      "subject": "Re: Test Campaign",
      "text": "I would like to schedule a meeting",
      "headers": {
        "in-reply-to": "original-message-id-123"
      }
    }
  }'
```

### 2. Test Unsubscribe Flow

1. Create an unsubscribe token via API
2. Visit `/u/[token]` 
3. Verify contact is added to suppressions
4. Check that future sends are stopped

### 3. Test Suppression Checks

```typescript
// In your send loop
const isSuppressed = await isContactSuppressed(workspaceId, email);
console.log(`${email} suppressed: ${isSuppressed}`);
```

## Monitoring & Analytics

### Key Metrics

- **Reply Rate**: Percentage of emails that get replies
- **Intent Distribution**: Breakdown of reply categories
- **Auto-stop Impact**: How many sequences are automatically stopped
- **Suppression Growth**: Rate of new suppressions by source

### Dashboard Views

- **Inbox Replies**: Real-time view of all inbound replies
- **Suppression Trends**: Growth and source breakdown
- **Campaign Performance**: Reply rates by campaign
- **Auto-stop Events**: Log of all automatic sequence stops

## Troubleshooting

### Common Issues

1. **Replies not being processed**
   - Check webhook endpoint is accessible
   - Verify `in_reply_to` header is being sent
   - Check database logs for errors

2. **Suppressions not working**
   - Verify RLS policies are correct
   - Check workspace_id is being set
   - Ensure email addresses are normalized

3. **Unsubscribe tokens not working**
   - Check token expiration
   - Verify token is being used only once
   - Check database constraints

### Debug Mode

Enable detailed logging:

```typescript
// In your environment
DEBUG=smartsend:*

// Or in code
console.log('Processing reply:', { message, workspaceId });
```

## Performance Considerations

### Database Indexes

The migration creates optimized indexes for:
- `inbound_messages(workspace_id, created_at)`
- `suppressions(workspace_id, kind, value_lower)`
- `unsubscribe_tokens(workspace_id, email_lower)`

### Caching

Consider caching suppression checks for high-volume sends:

```typescript
// Simple in-memory cache
const suppressionCache = new Map<string, boolean>();

async function isSuppressedCached(workspaceId: string, email: string) {
  const key = `${workspaceId}:${email}`;
  
  if (suppressionCache.has(key)) {
    return suppressionCache.get(key);
  }
  
  const result = await isContactSuppressed(workspaceId, email);
  suppressionCache.set(key, result);
  
  // Cache for 5 minutes
  setTimeout(() => suppressionCache.delete(key), 5 * 60 * 1000);
  
  return result;
}
```

## Next Steps

### Phase 2 Features

1. **Reply Router**: Auto-assign owners, push to Slack/CRM
2. **Advanced Intent**: LLM-powered classification with allowlists
3. **Preferences Center**: Pause vs global unsubscribe options
4. **DMARC/ARC**: Domain alignment and authentication status

### Integration Examples

- **Slack**: Post high-confidence meeting intents to sales channel
- **CRM**: Create tasks for interested prospects
- **Calendar**: Auto-schedule meetings for meeting intents
- **Analytics**: Track reply-to-meeting conversion rates

## Support

For questions or issues:
1. Check the troubleshooting section above
2. Review database logs for errors
3. Verify webhook payloads match expected format
4. Test with minimal data to isolate issues

---

**SmartSend is now LIVE!** 🚀

Your system now automatically:
- Detects and classifies replies
- Stops sequences when contacts engage
- Provides 1-click unsubscribe
- Enforces suppressions at send-time
- Scales to any number of contacts

The loop is closed. Feedback is immediate. Growth is sustainable. 