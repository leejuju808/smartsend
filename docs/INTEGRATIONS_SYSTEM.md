# SmartSend Integrations System

A comprehensive webhook and integration system that connects SmartSend with external tools like Zapier, Slack, and HubSpot.

## Overview

The integrations system provides real-time webhooks for email events (opens, clicks, replies) and allows users to connect their SmartSend account with popular business tools. This creates a powerful ecosystem that can automate workflows and provide instant notifications.

## Features

### 🔌 **Zapier Integration**
- Webhook triggers for all email events
- Connect with 5000+ apps and services
- Customizable payload structure
- Real-time event streaming

### 💬 **Slack Integration**
- Instant notifications in Slack channels
- Rich message formatting with emojis
- Configurable webhook URLs
- Event-specific message templates

### 🏢 **HubSpot Integration**
- Automatic contact sync
- Deal creation on engagement
- Activity logging
- CRM integration

## Architecture

### Database Schema

```sql
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null, -- zapier|slack|hubspot
  config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### API Endpoints

- `POST /api/integrations/webhook` - Main webhook endpoint for integrations
- `GET /api/integrations` - List user's integrations
- `POST /api/integrations` - Create new integration
- `DELETE /api/integrations?id={id}` - Delete integration

### Event Flow

1. **Email Event Occurs** (open, click, reply)
2. **Tracking Route** captures event and calls webhook
3. **Integrations Webhook** processes event
4. **External Services** receive notifications

## Implementation Details

### Webhook Payload Structure

```json
{
  "event": "reply|open|click|bounce|unsubscribe",
  "email": "user@example.com",
  "campaign_id": "campaign-uuid",
  "org_id": "workspace-uuid",
  "integration_id": "integration-uuid",
  "timestamp": "2025-01-31T10:00:00Z",
  "additional_data": {}
}
```

### Integration Types

#### Zapier
```json
{
  "type": "zapier",
  "config": {
    "url": "https://hooks.zapier.com/hooks/catch/..."
  }
}
```

#### Slack
```json
{
  "type": "slack",
  "config": {
    "webhook_url": "https://hooks.slack.com/services/..."
  }
}
```

#### HubSpot
```json
{
  "type": "hubspot",
  "config": {
    "access_token": "pat-..."
  }
}
```

### Event Handlers Integration

The system integrates with existing tracking routes:

- **Open Tracking** (`/api/track/open`) - Triggers on email open
- **Click Tracking** (`/api/track/click`) - Triggers on link click  
- **Reply Tracking** (`/api/track/reply`) - Triggers on email reply

Each handler calls the integrations webhook with relevant context.

## Usage Examples

### Setting up a Zapier Webhook

1. Go to `/dashboard/integrations`
2. Select "Zapier Webhook"
3. Create a webhook in Zapier
4. Paste the webhook URL
5. Configure your Zap to trigger on the webhook

### Setting up Slack Notifications

1. Go to `/dashboard/integrations`
2. Select "Slack Webhook"
3. Create a Slack app webhook
4. Paste the webhook URL
5. Receive instant notifications for all email events

### Setting up HubSpot Sync

1. Go to `/dashboard/integrations`
2. Select "HubSpot CRM"
3. Get your access token from HubSpot
4. Paste the token
5. Contacts and deals sync automatically

## Security Features

- **Row Level Security (RLS)** - Users can only access their workspace integrations
- **Workspace Isolation** - Integrations are scoped to specific workspaces
- **Authentication Required** - All API endpoints require valid user session
- **Input Validation** - Config validation based on integration type

## Testing

Run the integration test script:

```bash
npm run test:integrations
# or
tsx scripts/test-integrations.ts
```

## Development

### Adding New Integration Types

1. **Update Database Schema** - Add new type to validation
2. **Extend Webhook Handler** - Add case for new type in `/api/integrations/webhook`
3. **Create Utility Functions** - Add helper functions in `/lib/integrations/`
4. **Update UI** - Add form fields and validation in dashboard

### Adding New Events

1. **Update Event Handlers** - Modify tracking routes to include org_id
2. **Extend Webhook Payload** - Add new event type and data
3. **Update Slack Formatting** - Add emoji and message templates
4. **Test Integration** - Verify webhooks trigger correctly

## Monitoring & Debugging

### Logs
- Webhook calls are logged with timestamps
- Failed integrations don't block main functionality
- Error handling includes detailed logging

### Testing
- Use the test script to verify system health
- Check webhook delivery in external tools
- Monitor database for integration records

## Performance Considerations

- **Non-blocking Webhooks** - Main event processing continues regardless of webhook success
- **Async Processing** - All external calls use `fetch` with error handling
- **Connection Pooling** - Database connections are reused efficiently
- **Rate Limiting** - Consider implementing if needed for high-volume usage

## Future Enhancements

- **Webhook Retry Logic** - Automatic retry for failed webhooks
- **Event Filtering** - Allow users to select which events trigger webhooks
- **Payload Customization** - User-defined webhook payload structure
- **Integration Analytics** - Track webhook delivery success rates
- **OAuth Flows** - Native authentication for supported services

## Troubleshooting

### Common Issues

1. **Webhook Not Triggering**
   - Check if org_id is being passed in tracking URLs
   - Verify integration is active and configured
   - Check browser console for errors

2. **Slack Messages Not Appearing**
   - Verify webhook URL is correct
   - Check Slack app permissions
   - Test webhook URL manually

3. **HubSpot Sync Failing**
   - Verify access token is valid
   - Check HubSpot API rate limits
   - Ensure proper contact properties

### Debug Steps

1. Check browser network tab for failed requests
2. Verify database records exist for integrations
3. Test webhook endpoints manually with Postman
4. Check server logs for error messages

## Support

For integration issues:
1. Check this documentation
2. Run the test script
3. Review browser console errors
4. Check server logs
5. Contact development team

---

*This integrations system transforms SmartSend from a standalone email tool into a powerful hub for business automation and team collaboration.* 