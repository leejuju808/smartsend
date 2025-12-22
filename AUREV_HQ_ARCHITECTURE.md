# AUREV HQ Architecture

**One AI Operating System powering Communication ⚡ Operations ⚡ Agents.**

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AUREV HQ Hub                             │
│                   (Next.js + Supabase)                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Dashboard                                           │   │
│  │  - Unified Metrics                                   │   │
│  │  - Real-time Activity Feed                           │   │
│  │  - Cross-app Navigation                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  API Layer                                            │   │
│  │  - /api/aurev/metrics                                │   │
│  │  - /api/billing/aurev-upgrade                        │   │
│  │  - /api/sync/* (agents, smartsend, opsgrid, etc.)   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ JWT (org_id, app_role)
                           ▼
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  SmartSend   │   │   OpsGrid    │   │ AgentCloud   │
│  (Next.js)   │   │  (Next.js)   │   │  (Next.js)   │
│              │   │              │   │              │
│ • Outreach   │   │ • Operations │   │ • AI Agents  │
│ • Sequences  │   │ • Workflows  │   │ • Automations│
│ • Inbox      │   │ • CRM        │   │ • LLMs       │
└──────────────┘   └──────────────┘   └──────────────┘
                           │
                           │ Edge Functions
                           ▼
        ┌────────────────────────────────────┐
        │   Supabase Edge Functions          │
        │                                    │
        │  • sync_contacts                   │
        │    SmartSend → OpsGrid             │
        │                                    │
        │  • agent_trigger                   │
        │    Cross-app automation            │
        └────────────────────────────────────┘
                           │
                           │
                           ▼
        ┌────────────────────────────────────┐
        │   Shared Supabase Database          │
        │                                    │
        │  Tables:                           │
        │  • orgs (shared)                   │
        │  • org_members                     │
        │  • aurev_* (unified schema)        │
        │  • app_revenue                     │
        │  • aurev_usage_events              │
        │  • aurev_sync_logs                 │
        │  • stripe_connect_accounts         │
        └────────────────────────────────────┘
                           │
                           ▼
        ┌────────────────────────────────────┐
        │   Stripe Connect                   │
        │                                    │
        │  • Sub-accounts per app            │
        │  • Unified billing                 │
        │  • Usage tracking                  │
        └────────────────────────────────────┘
```

## 🔐 Authentication & Authorization

### JWT Claims

```typescript
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "org_id": "org-uuid",          // ✅ Shared across apps
  "app_role": "owner|admin|member", // ✅ Cross-app permissions
  "iat": 1234567890
}
```

### Data Isolation

**RLS Policies:**
- All tables scoped by `org_id`
- Membership verified via `org_members`
- Cross-app permissions uniform
- Service role bypasses RLS for system ops

### Auth Flow

```
1. User logs in via Supabase Auth
   ↓
2. JWT issued with org_id + app_role
   ↓
3. Cross-app permissions validated
   ↓
4. Data access gated by org_id
   ↓
5. RLS enforces isolation
```

## 📊 Data Flow

### Contact Sync (SmartSend → OpsGrid)

```
1. New lead created in SmartSend
   ↓
2. Event: lead.created
   ↓
3. Edge Function: sync_contacts
   - Fetches lead data
   - Transforms to OpsGrid format
   - Sends to OpsGrid API
   - Logs sync operation
   ↓
4. OpsGrid stores as contact
   ↓
5. Linked via smartsend_lead_id
```

### Cross-App Automation

```
1. Event occurs (e.g., lead replies)
   ↓
2. Edge Function: agent_trigger
   - Determines trigger type
   - Routes to appropriate handler
   - Calls automation endpoints
   ↓
3. Actions executed:
   - SmartSend → AgentCloud: Auto follow-up
   - OpsGrid → SmartSend: Auto campaign
   ↓
4. Results logged to aurev_events
```

### Revenue Aggregation

```
1. Subscription created/updated
   ↓
2. Stripe webhook fires
   ↓
3. app_revenue table updated
   ↓
4. Combined metrics calculated:
   - Total MRR across apps
   - Total ARR
   - Active orgs
   ↓
5. Dashboard displays unified view
```

## 🗄️ Database Schema

### Core Tables

```sql
-- Shared Organizations
orgs (
  id, name, owner_id, created_at
)

-- Cross-app Membership
org_members (
  org_id, user_id, role, created_at
)

-- AUREV Modules
aurev_modules (
  id, org_id, module, status, usage, settings
)

-- Unified Events
aurev_events (
  id, org_id, event_type, module, payload,
  resource_type, resource_id, created_at
)

-- Usage Tracking
aurev_usage_tracking (
  id, org_id, module, year, month,
  actions_count, {module}_specific_metrics
)

-- Revenue Tracking
app_revenue (
  id, org_id, app, month, mrr, arr,
  active_subscriptions
)

-- Sync Logs
aurev_sync_logs (
  id, org_id, sync_type, source_module,
  target_module, records_synced, status
)

-- Billing
aurev_subscriptions (
  id, org_id, stripe_customer_id,
  plan_tier, apps_included, status
)

-- Contacts Sync
opsgrid_contacts (
  id, org_id, email, first_name, last_name,
  company, smartsend_lead_id
)
```

### Key Relationships

```
orgs (1) ────< (> many) org_members (> many) ────< (> many) profiles

orgs (1) ────< (> many) aurev_modules
orgs (1) ────< (> many) aurev_events
orgs (1) ────< (> many) aurev_usage_tracking
orgs (1) ────< (> many) app_revenue
orgs (1) ────< (> many) aurev_subscriptions

opsgrid_contacts.smartsend_lead_id ──── references ────> leads.id
```

## 🔄 Event-Driven Architecture

### Event Types

```typescript
type EventType =
  | 'lead_reply'          // Lead replied in SmartSend
  | 'lead_qualified'      // Lead qualified
  | 'workflow_completed'  // Workflow completed in OpsGrid
  | 'task_created'        // Task created
  | 'campaign_sent'       // Campaign sent
  | 'agent_deployed';     // Agent deployed
```

### Module Types

```typescript
type Module =
  | 'smartsend'    // Communication
  | 'opsgrid'      // Operations
  | 'agentcloud';  // Agents
```

### Cross-App Routing

```
SmartSend Events:
  lead_reply → AgentCloud (auto follow-up)
  
OpsGrid Events:
  workflow_completed → SmartSend (auto campaign)
  
AgentCloud Events:
  agent_deployed → All apps (notify)
```

## 💰 Billing Architecture

### Plan Tiers

```typescript
{
  basic: {
    apps: ['smartsend'],
    price: '$99/mo',
    limits: { emails: 1000 }
  },
  pro: {
    apps: ['smartsend', 'opsgrid'],
    price: '$299/mo',
    limits: { emails: 10000, workflows: 'unlimited' }
  },
  enterprise: {
    apps: ['smartsend', 'opsgrid', 'agentcloud'],
    price: '$999/mo',
    limits: { everything: 'unlimited' }
  }
}
```

### Billing Flow

```
User selects plan → Create Stripe customer → Create Checkout
  ↓
Payment completes → Webhook updates subscription
  ↓
Apps enabled → Usage tracked → Monthly billing
  ↓
Revenue aggregated → Dashboard displays MRR
```

## 🚀 Scalability

### Horizontal Scaling

- **Apps:** Independent Next.js deployments
- **Database:** Shared Supabase instance (vertical scaling)
- **Edge Functions:** Auto-scales with Supabase
- **Billing:** Stripe handles load

### Data Partitioning

- **By org_id:** RLS enforces partitioning
- **By module:** Separate tracking tables
- **By time:** Monthly aggregates

### Performance

- **Caching:** Next.js ISR for dashboard
- **Aggregation:** Materialized views for metrics
- **Indexing:** On org_id, module, date
- **Async:** Edge functions for heavy ops

## 🔍 Monitoring

### Key Metrics

```typescript
{
  ecosystem: {
    total_orgs: number,
    active_users: number,
    combined_mrr: number
  },
  apps: {
    smartsend: { emails_sent, leads_generated },
    opsgrid: { workflows_run, tasks_completed },
    agentcloud: { messages_sent, agents_deployed }
  },
  sync: {
    contacts_synced: number,
    automation_triggers: number,
    errors: number
  }
}
```

### Observability

- **Logs:** Edge function logs
- **Analytics:** aurev_events table
- **Revenue:** app_revenue aggregation
- **Errors:** aurev_sync_logs failures

## 🛡️ Security

### Layers

1. **Auth:** Supabase JWT + RLS
2. **API:** Header-based auth (AUREV_SYNC_KEY)
3. **Data:** Org-level isolation
4. **Billing:** Stripe PCI compliance
5. **Network:** HTTPS only

### Threat Model

- **SQL Injection:** Parameterized queries
- **XSS:** React SSR sanitization
- **CSRF:** SameSite cookies
- **Unauthorized Access:** RLS policies
- **API Abuse:** Rate limiting

## 📈 Future Enhancements

### Phase 1 (Complete ✅)
- Shared auth & org
- Contact sync
- Basic automation
- Unified dashboard
- Stripe Connect

### Phase 2 (Next)
- Real-time sync via Pub/Sub
- Advanced automation rules
- Cross-app notifications
- Single sign-on (SSO)

### Phase 3 (Future)
- AI-powered insights
- Predictive analytics
- Auto-scaling plans
- Marketplace integration

---

**AUREV HQ: Where Intelligent Automation Meets Execution** ⚡

