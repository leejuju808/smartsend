# AUREV HQ Unified Ecosystem

This document describes the unified backend system that connects SmartSend, OpsGrid, and AgentCloud under one AUREV HQ ecosystem.

## Overview

AUREV HQ unifies three flagship apps with:
- ✅ Shared Supabase Auth
- ✅ Unified Organizations & Billing (Stripe)
- ✅ Cross-App Data Sync
- ✅ Unified Dashboard
- ✅ Cross-App Navigation

## Architecture

### 1. Shared Database Schema

**Migration:** `supabase/migrations/20250110000025_shared_orgs.sql`

- `orgs` table with `owner` column (references `auth.users`)
- `profiles.org_id` for organization membership
- Same Supabase project shared across all apps

### 2. Cross-App Sync APIs

Each app exposes a sync endpoint secured with `AUREV_SYNC_KEY`:

#### SmartSend: `/api/sync/agents`
Returns:
```json
{
  "agents": [...],
  "metrics": {
    "total_agents": 5,
    "total_leads_generated": 1234,
    "total_leads_converted": 56,
    "total_messages_sent": 890,
    "conversion_rate": "4.54"
  }
}
```

#### OpsGrid: `/api/sync/workflows` (to be implemented in OpsGrid app)
Returns workflow and automation data.

#### AgentCloud: `/api/sync/deployments` (to be implemented in AgentCloud app)
Returns deployed AI agent information.

**Authentication:**
All sync endpoints require header:
```
x-aurev-sync: <AUREV_SYNC_KEY>
```

### 3. AUREV HQ Dashboard

**Location:** `/aurev-hq/dashboard`

Displays real-time metrics from all three apps:
- SmartSend: Active agents, leads generated, conversion rates
- OpsGrid: Active workflows, automation metrics
- AgentCloud: AI deployments, performance data

**Proxy Routes:**
- `/api/sync/smartsend` - Proxies to SmartSend's internal sync
- `/api/sync/opsgrid` - Calls OpsGrid sync endpoint (graceful degradation if unavailable)
- `/api/sync/agentcloud` - Calls AgentCloud sync endpoint (graceful degradation if unavailable)

### 4. Unified Navigation

**Component:** `src/components/AUREVNavBar.tsx`

A navigation bar that appears on all dashboards, enabling instant switching between:
- SmartSend
- OpsGrid  
- AgentCloud
- AUREV HQ ⚡

The nav bar detects the current app and highlights it.

### 5. Unified Billing

**Endpoint:** `/api/billing/upgrade`

Supports three AUREV plan tiers:

| Tier | Apps Included | Stripe Price ID |
|------|---------------|-----------------|
| **AUREV Basic** | SmartSend only | `STRIPE_AUREV_BASIC_PRICE_ID` |
| **AUREV Pro** | SmartSend + OpsGrid | `STRIPE_AUREV_PRO_PRICE_ID` |
| **AUREV Enterprise** | All 3 apps | `STRIPE_AUREV_ENTERPRISE_PRICE_ID` |

All plans share the same Stripe customer ID stored in `profiles.stripe_customer_id`.

## Environment Variables

Add to `.env.local`:

```bash
# Shared sync key (use same value across all apps)
AUREV_SYNC_KEY=your_long_random_sync_key_here_32_chars_min

# App URLs
NEXT_PUBLIC_SMARTSEND_URL=https://smartsendhq.com
NEXT_PUBLIC_OPSGRID_URL=https://opsgridhq.com
NEXT_PUBLIC_AGENTCLOUD_URL=https://agentcloudapp.com
NEXT_PUBLIC_AUREVHQ_URL=https://aurevhq.com

# Optional: Custom sync URLs
OPSGRID_SYNC_URL=https://opsgridhq.com/api/sync/workflows
AGENTCLOUD_SYNC_URL=https://agentcloudapp.com/api/sync/deployments

# Unified Stripe Plans
STRIPE_AUREV_BASIC_PRICE_ID=price_basic_smartsend_only
STRIPE_AUREV_PRO_PRICE_ID=price_pro_smartsend_opsgrid
STRIPE_AUREV_ENTERPRISE_PRICE_ID=price_enterprise_all_apps
```

## Implementation Steps

### For SmartSend (This App)

✅ **Completed:**
- Shared org schema migration
- `/api/sync/agents` endpoint
- AUREV HQ dashboard
- Unified navigation bar
- Unified billing upgrade endpoint

### For OpsGrid App

**Required:**
1. Add `AUREV_SYNC_KEY` to environment variables
2. Implement `/api/sync/workflows` endpoint:
```typescript
export async function GET(req: Request) {
  const authKey = req.headers.get("x-aurev-sync");
  if (authKey !== process.env.AUREV_SYNC_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  
  // Fetch workflows data
  const workflows = await fetchWorkflows();
  return NextResponse.json({ workflows, metrics: { total_workflows: workflows.length } });
}
```
3. Add `AUREVNavBar` component to dashboard layout
4. Use same Supabase project or linked JWT keys

### For AgentCloud App

**Required:**
1. Add `AUREV_SYNC_KEY` to environment variables
2. Implement `/api/sync/deployments` endpoint:
```typescript
export async function GET(req: Request) {
  const authKey = req.headers.get("x-aurev-sync");
  if (authKey !== process.env.AUREV_SYNC_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  
  // Fetch deployments data
  const deployments = await fetchDeployments();
  return NextResponse.json({ deployments, metrics: { total_deployments: deployments.length } });
}
```
3. Add `AUREVNavBar` component to dashboard layout
4. Use same Supabase project or linked JWT keys

## Testing

1. **Test SmartSend sync:**
```bash
curl -H "x-aurev-sync: YOUR_SYNC_KEY" http://localhost:3000/api/sync/agents
```

2. **Test AUREV HQ dashboard:**
Navigate to `/aurev-hq/dashboard` - should show SmartSend metrics.

3. **Test navigation:**
The nav bar should appear on all dashboard pages. Clicking links should navigate to respective apps.

4. **Test billing upgrade:**
```bash
curl -X POST http://localhost:3000/api/billing/upgrade \
  -H "Content-Type: application/json" \
  -d '{"plan": "pro"}'
```

## Database Migration

Run the migration:
```bash
# In Supabase SQL editor or via migration tool
supabase/migrations/20250110000025_shared_orgs.sql
```

This will:
- Add `owner` column to `orgs` table
- Ensure `profiles.org_id` exists
- Create indexes for performance

## Security Notes

1. **Sync Key:** Use a strong, random 32+ character string for `AUREV_SYNC_KEY`
2. **HTTPS:** Always use HTTPS in production for sync endpoints
3. **Rate Limiting:** Consider adding rate limiting to sync endpoints
4. **CORS:** If apps are on different domains, configure CORS appropriately

## Future Enhancements

- [ ] Real-time updates via Supabase Realtime
- [ ] Cross-app notifications
- [ ] Unified analytics dashboard
- [ ] Single sign-on (SSO) across apps
- [ ] Shared workspace switching
- [ ] Cross-app data exports

## Definition of Done ✅

- [x] Shared Supabase Auth + org schema
- [x] Secure cross-app sync APIs live (SmartSend complete, OpsGrid/AgentCloud pending)
- [x] AUREV HQ dashboard displaying unified data
- [x] Stripe billing + plan tiers unified
- [x] Nav bar enables instant cross-app switching

## Support

For questions or issues, refer to:
- SmartSend sync: `/api/sync/agents`
- OpsGrid sync: Implement in OpsGrid app
- AgentCloud sync: Implement in AgentCloud app
- Billing: `/api/billing/upgrade`

