# AUREV HQ Partner Ecosystem Implementation

## Overview

Complete implementation of AUREV HQ's partner integration ecosystem, enabling seamless connections between SmartSend, OpsGrid, and AgentCloud with external platforms through a unified API gateway.

**Target: 5 official partners + 10 native integrations by July 2026**

## Architecture

### Partner API Gateway
- **Base URL**: `/api/hq/integrations/:service`
- **Authentication**: JWT + Per-app API keys
- **Endpoints**:
  - `GET /api/hq/integrations/:service?action=auth` - Get OAuth URL
  - `GET /api/hq/integrations/:service?action=sync` - Get sync status
  - `POST /api/hq/integrations/:service` - Trigger actions

### Webhook Router
- **Edge Function**: `supabase/functions/webhook_router/index.ts`
- **Endpoint**: `/webhook/:service`
- **Security**: Webhook signature verification
- **Supported**: HubSpot, Slack, Zapier, Stripe, Notion

### Developer Portal
- **UI**: `/hq/dev`
- **Features**:
  - Partner API key management
  - Integration connection status
  - Real-time documentation
  - Usage analytics

## Database Schema

### Partner API Keys
```sql
CREATE TABLE partner_api_keys (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id),
  partner_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Webhook Logs
```sql
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY,
  service TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Integration Stats
```sql
CREATE TABLE partner_integration_stats (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id),
  integration_id UUID REFERENCES integrations(id),
  api_calls_count INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  UNIQUE(org_id, integration_id, year, month)
);
```

## Partner Integrations

### Tier 1 Partners (Official)
1. **Stripe** - Usage-based billing + Connect onboarding
2. **Supabase** - Joint case study + feature integration
3. **OpenAI** - API co-pilot + showcase app listing
4. **HubSpot** - Two-way sync for contacts & deals
5. **Notion** - AI summary sync + dashboard embed

### Tier 2 Integrations (Marketplace)
6. **Zapier** - No-code automation hooks
7. **Make** - Visual automation builder
8. **Slack** - Notifications + AI reply alerts
9. **Google Workspace** - Sheets/Calendar data import
10. **Pipedrive** - CRM contact sync

## Integration Layers

### 1. Inbound Sync
Pull data from partner services into AUREV:
- HubSpot → OpsGrid: Sync contacts, deals, companies
- Stripe → HQ: Sync billing events, invoices
- Notion → Agent Cloud: Sync database changes

### 2. Outbound Actions
Trigger actions in partner services from AUREV:
- SmartSend → Slack: Send reply notifications
- OpsGrid → Zapier: Trigger workflows
- Agent Cloud → HubSpot: Create deals

### 3. Data Intelligence
Transform and analyze data:
- AI summaries for HubSpot deals
- Trend analysis for Stripe billing
- Smart notifications for Slack channels

### 4. Unified Billing
- Single invoice per org
- Usage sharing across apps
- Partner revenue splits

## API Usage Examples

### Create Partner API Key
```bash
curl -X POST https://hq.aurevhq.com/api/hq/partner-keys \
  -H "Content-Type: application/json" \
  -d '{"label": "Zapier Integration"}'

Response:
{
  "key": {
    "id": "uuid",
    "partner_name": "Zapier Integration",
    "api_key": "aurev_abcd1234...",
    "status": "active"
  }
}
```

### Connect Integration
```bash
curl -X GET "https://hq.aurevhq.com/api/hq/integrations/hubspot?action=auth" \
  -H "Authorization: Bearer YOUR_API_KEY"

Response:
{
  "service": "hubspot",
  "oauth_url": "https://app.hubspot.com/oauth/...",
  "redirect_uri": "https://hq.aurevhq.com/api/oauth/hubspot/callback"
}
```

### Trigger Action
```bash
curl -X POST https://hq.aurevhq.com/api/hq/integrations/hubspot \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_lead",
    "email": "alex@acme.com",
    "name": "Alex Johnson",
    "company": "Acme Corp",
    "source": "smartsend"
  }'

Response:
{
  "success": true,
  "service": "hubspot",
  "action": "create_lead",
  "lead_id": "lead_123456",
  "message": "Lead created in hubspot"
}
```

### Webhook Configuration
```bash
# HubSpot webhook URL
https://hq.aurevhq.com/webhook/hubspot

# Slack webhook URL
https://hq.aurevhq.com/webhook/slack

# Zapier webhook URL
https://hq.aurevhq.com/webhook/zapier
```

## Partner Outreach Templates

### Email Template
```
Subject: Partnership Opportunity — AUREV HQ × [Company Name]

Hi [Name],

I'm Julian Lee, founder of AUREV HQ, the AI Operating System that unites email 
automation, CRM, and agent workflows.

We've grown to 100+ orgs and $85K MRR across our suite — powered by Stripe, 
Supabase, and OpenAI.

I'd love to explore a native integration + co-marketing partnership with 
[Company Name].

Here's our partner page: https://aurevhq.com/dev

Best,
Julian ⚡
```

## Roadmap

### Q2 2026

#### April
- ✅ Stripe Connect integration
- ✅ Supabase showcase case study
- ✅ Developer portal live

#### May
- 🔄 HubSpot two-way sync
- 🔄 Notion database sync
- 🔄 Partner API gateway

#### June
- 📅 Slack notifications
- 📅 Zapier connectors
- 📅 Automated sync flows

#### July
- 📅 OpenAI co-pilot
- 📅 Google Workspace integration
- 📅 10+ native integrations

## Metrics & KPIs

| KPI | Target |
|-----|--------|
| Official partners | 5+ |
| Active integrations | 10+ |
| API calls/day | 25,000+ |
| Connected orgs | 200+ |
| Co-marketing reach | 500K+ impressions |

## Security

### API Key Management
- 64-character random hex keys
- Prefix: `aurev_` for identification
- Masked in UI (first 8 + last 4 visible)
- Revocable via UI or API

### Webhook Security
- Signature verification per service
- Rate limiting
- Request logging
- Error handling

### Data Privacy
- RLS policies on all tables
- Org-level isolation
- Encrypted tokens
- Audit trails

## Testing

### Test API Key Creation
```bash
curl -X POST http://localhost:3000/api/hq/partner-keys \
  -H "Content-Type: application/json" \
  -d '{"label": "Test Integration"}'
```

### Test Webhook Router
```bash
curl -X POST http://localhost:54321/functions/v1/webhook_router \
  -H "Content-Type: application/json" \
  -d '{
    "service": "slack",
    "event_type": "message",
    "data": {"text": "Hello world"}
  }'
```

## Deployment

1. **Run Migration**
```bash
supabase db push
```

2. **Deploy Edge Function**
```bash
supabase functions deploy webhook_router
```

3. **Configure Webhooks**
- Set up webhook endpoints in partner dashboards
- Configure signature verification secrets
- Test webhook delivery

4. **Seed Integrations**
```bash
# Already done via migration 20260102000001_seed_integrations.sql
```

## Documentation

### Developer Resources
- Partner API docs: `/dev/docs/api`
- Integration guides: `/dev/docs/integrations`
- Webhook reference: `/dev/docs/webhooks`
- Example code: `/dev/docs/examples`

### Partner Resources
- Partnership program: `/partners`
- Co-marketing guide: `/partners/marketing`
- Revenue share: `/partners/revenue`

## Success Metrics

### Current State
- 100+ orgs
- $85K MRR
- 3 apps (SmartSend, OpsGrid, AgentCloud)

### Target State (July 2026)
- 200+ connected orgs
- $100K MRR
- 5 official partners
- 10+ integrations
- 25K+ API calls/day

## Next Steps

1. ✅ Database schema created
2. ✅ API gateway implemented
3. ✅ Webhook router deployed
4. ✅ Developer portal built
5. 🔄 Outreach to Stripe, Supabase, OpenAI
6. 📅 HubSpot integration completion
7. 📅 Documentation published
8. 📅 Co-marketing campaigns

## Support

For questions or support:
- Email: partners@aurevhq.com
- Documentation: https://aurevhq.com/dev
- Discord: https://discord.gg/aurevhq

---

**Built with ⚡ for AUREV HQ**
*One AI Operating System powering Communication ⚡ Operations ⚡ Agents*

