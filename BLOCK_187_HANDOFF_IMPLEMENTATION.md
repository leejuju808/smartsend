# Block 187 — Human Handoff + CRM Push Implementation

## Overview

This implementation adds a complete handoff system that automatically pushes hot leads to CRM systems (PipeDrive, HubSpot, Salesforce) or sends notifications (Slack, Email, Discord) when leads become hot based on AI analysis.

## Files Created

### Database Migrations

1. **`supabase/migrations/20251113220000_handoff_settings.sql`**
   - Adds `handoff_mode` and `handoff_destination` columns to `campaigns` table
   - `handoff_mode`: 'none', 'manual', 'auto'
   - `handoff_destination`: 'none', 'pipedrive', 'hubspot', 'salesforce', 'email', 'slack', 'discord'

2. **`supabase/migrations/20251113220100_handoff_logs.sql`**
   - Creates `handoff_logs` table to track all handoff attempts
   - Includes account_id, lead_id, company_id, campaign_id, method, status, meta

3. **`supabase/migrations/20251113220200_activity_log_handoff_events.sql`**
   - Adds handoff event types to `activity_log`: 'handoff_initiated', 'handoff_success', 'handoff_failed'

4. **`supabase/migrations/20251113220300_handoff_trigger.sql`**
   - Creates `should_trigger_handoff()` function to check handoff conditions
   - Creates `log_handoff_attempt()` function to log handoff attempts

### Handoff Engine

5. **`lib/handoff/types.ts`**
   - TypeScript types for handoff payloads and results

6. **`lib/handoff/engine.ts`**
   - Unified handoff engine that routes to appropriate integration

7. **`lib/handoff/pipedrive.ts`**
   - PipeDrive integration - creates deals and persons

8. **`lib/handoff/hubspot.ts`**
   - HubSpot integration - creates deals and contacts

9. **`lib/handoff/salesforce.ts`**
   - Salesforce integration - creates opportunities and leads

10. **`lib/handoff/slack.ts`**
    - Slack webhook integration with rich formatting

11. **`lib/handoff/email.ts`**
    - Email notification via Resend API

12. **`lib/handoff/discord.ts`**
    - Discord webhook integration with embeds

13. **`lib/handoff/trigger.ts`**
    - Helper function to check and trigger handoffs

14. **`lib/handoff/internal.ts`**
    - Internal handoff function for service role contexts

15. **`lib/handoff/index.ts`**
    - Module exports

### API Routes

16. **`app/api/handoff/route.ts`**
    - Manual handoff API endpoint (requires authentication)

17. **`app/api/handoff/internal/route.ts`**
    - Internal handoff API endpoint (requires INTERNAL_API_KEY)

### Edge Function Updates

18. **`supabase/functions/conversation-intelligence/index.ts`**
    - Updated to trigger handoff automatically when opportunity score >= 7 or tone is positive

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# CRM Integrations
PIPEDRIVE_API_KEY=your_pipedrive_api_key
HUBSPOT_API_KEY=your_hubspot_api_key
SALESFORCE_ACCESS_TOKEN=your_salesforce_token
SALESFORCE_INSTANCE_URL=your_salesforce_instance_url

# Notifications
SLACK_WEBHOOK_URL=your_slack_webhook_url
DISCORD_WEBHOOK_URL=your_discord_webhook_url
SALES_TEAM_EMAIL=sales@company.com

# Email (uses existing RESEND_API_KEY)
RESEND_API_KEY=your_resend_api_key

# Internal API
INTERNAL_API_KEY=your_internal_api_key_for_edge_functions
```

## Usage

### Setting Up Campaign Handoff

1. Update a campaign to enable handoff:
```sql
UPDATE campaigns 
SET handoff_mode = 'auto',
    handoff_destination = 'pipedrive'
WHERE id = 'campaign-id';
```

### Manual Handoff

Call the API endpoint:
```typescript
POST /api/handoff
{
  "threadId": "thread-uuid"
}
```

### Automatic Handoff

Handoff is automatically triggered when:
- `ai_opportunity_score >= 7` OR
- `ai_category` is 'interested' or 'meeting'

And the campaign has:
- `handoff_mode = 'auto'`
- `handoff_destination` set to a valid destination

## Handoff Conditions

Handoff triggers when:
- `thread.ai_opportunity_score >= 7` OR
- `thread.ai_category === "interested"` OR
- `thread.ai_category === "meeting"`

## Integration Details

### PipeDrive
- Creates a deal with value = opportunity_score * 100
- Creates/finds person with email
- Links person to deal
- Adds summary, tone, opportunity score, buyer role, objections as deal note

### HubSpot
- Creates/finds contact with email
- Creates deal with amount = opportunity_score * 100
- Links contact to deal
- Sets deal stage to 'appointmentscheduled'

### Salesforce
- Creates/finds lead with email
- Creates opportunity with amount = opportunity_score * 100
- Sets stage to 'Prospecting'
- Sets close date to 30 days from now

### Slack
- Sends formatted message with blocks
- Includes lead name, email, company, opportunity score, tone, summary, objections

### Email
- Sends HTML email via Resend
- Includes all lead intelligence data
- Formatted for easy reading

### Discord
- Sends embed message
- Includes all lead intelligence fields
- Color-coded (red for hot leads)

## Activity Logging

All handoff attempts are logged to:
1. `handoff_logs` table - detailed handoff logs
2. `activity_log` table - activity events ('handoff_initiated', 'handoff_success', 'handoff_failed')

## Testing

1. Set up a test campaign with handoff enabled
2. Create a reply thread with high opportunity score
3. Check `handoff_logs` table for handoff attempts
4. Verify CRM/notification received the handoff

## Next Steps

1. Add UI component for "Hand to Sales" button in thread view
2. Add campaign settings UI for configuring handoff
3. Add handoff logs view in dashboard
4. Add retry logic for failed handoffs
5. Add webhook callbacks for CRM sync status












