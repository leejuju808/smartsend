# AUREV HQ Quick Start Guide

Get AUREV HQ unified ecosystem up and running in 5 minutes.

## 🚀 Prerequisites

- Supabase project with existing orgs/workspaces
- Stripe account with Connect enabled
- SmartSend app running

## ⚡ Setup (5 Minutes)

### 1. Environment Variables

Add to `.env.local`:

```bash
# Shared Sync Key (generate: openssl rand -base64 32)
AUREV_SYNC_KEY=your_long_random_sync_key_here_32_chars_min

# App URLs
NEXT_PUBLIC_SMARTSEND_URL=http://localhost:3000
NEXT_PUBLIC_OPSGRID_URL=http://localhost:4000
NEXT_PUBLIC_AGENTCLOUD_URL=http://localhost:5000
NEXT_PUBLIC_AUREVHQ_URL=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_AUREV_BASIC_PRICE_ID=price_...
STRIPE_AUREV_PRO_PRICE_ID=price_...
STRIPE_AUREV_ENTERPRISE_PRICE_ID=price_...
```

### 2. Database Migrations

Run in order:

```bash
# Via Supabase CLI
supabase db push

# Or manually in Supabase SQL Editor:
# 1. 20250110000025_shared_orgs.sql
# 2. 20251101000000_aurev_core_system.sql
# 3. 20260101000000_aurev_unified_ecosystem.sql
# 4. 20260102000000_stripe_connect_billing.sql
```

### 3. Deploy Edge Functions

```bash
# Deploy sync_contacts
supabase functions deploy sync_contacts

# Deploy agent_trigger
supabase functions deploy agent_trigger
```

### 4. Configure Stripe

1. Create products in Stripe Dashboard:
   - **AUREV Basic** ($99/mo) - SmartSend only
   - **AUREV Pro** ($299/mo) - SmartSend + OpsGrid
   - **AUREV Enterprise** ($999/mo) - All 3 apps

2. Copy Price IDs to environment variables

3. Set up webhook: `/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`

### 5. Launch

```bash
npm run dev

# Navigate to:
http://localhost:3000/aurev-hq/dashboard
```

## 🧪 Test It Works

### Dashboard

```bash
curl http://localhost:3000/api/aurev/metrics | jq
```

Should return:
```json
{
  "org_id": null,
  "total_actions_today": 0,
  "combined_revenue": {
    "mrr": 0,
    "arr": 0,
    "active_orgs": 1
  },
  "apps": {
    "smartsend": {
      "active": true,
      "emails_sent_today": 0
    }
  }
}
```

### Sync Contacts

```bash
curl -X POST http://localhost:54321/functions/v1/sync_contacts \
  -H "x-aurev-sync: YOUR_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_id": "YOUR_ORG_ID"}'
```

### Agent Trigger

```bash
curl -X POST http://localhost:54321/functions/v1/agent_trigger \
  -H "x-aurev-sync: YOUR_SYNC_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "YOUR_ORG_ID",
    "trigger_type": "lead_reply",
    "source_module": "smartsend",
    "resource_id": "thread-id",
    "resource_type": "email_thread"
  }'
```

## 📊 Usage Examples

### Sync SmartSend Leads → OpsGrid

```typescript
// Triggered automatically when new leads added
// Or manually via:
const response = await fetch('/api/sync/contacts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-aurev-sync': process.env.AUREV_SYNC_KEY
  },
  body: JSON.stringify({ org_id: 'org-123' })
});
```

### Cross-App Automation

```typescript
// When lead replies in SmartSend
await fetch('/functions/v1/agent_trigger', {
  method: 'POST',
  headers: {
    'x-aurev-sync': process.env.AUREV_SYNC_KEY
  },
  body: JSON.stringify({
    org_id: 'org-123',
    trigger_type: 'lead_reply',
    source_module: 'smartsend',
    resource_id: 'thread-456',
    resource_type: 'email_thread'
  })
});

// Automatically triggers:
// - AgentCloud: Auto follow-up
// - OpsGrid: Create task
```

### Billing Upgrade

```typescript
// User clicks "Upgrade to Pro"
const response = await fetch('/api/billing/aurev-upgrade', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    org_id: 'org-123',
    plan_tier: 'pro' // basic | pro | enterprise
  })
});

const { checkout_url } = await response.json();
window.location.href = checkout_url;
```

## 🔍 Key Files

| File | Purpose |
|------|---------|
| `src/app/aurev-hq/dashboard/page.tsx` | Main dashboard |
| `src/app/api/aurev/metrics/route.ts` | Metrics API |
| `src/components/AUREVNavBar.tsx` | Navigation |
| `src/components/AUREVBrand.tsx` | Branding |
| `supabase/functions/sync_contacts/index.ts` | Lead sync |
| `supabase/functions/agent_trigger/index.ts` | Automation |
| `supabase/migrations/20260101*.sql` | Schema |

## 🐛 Troubleshooting

### Dashboard shows "No data"

Check:
- Database migrations ran successfully
- `aurev_*` tables exist
- Edge functions deployed

### Sync fails

Check:
- `AUREV_SYNC_KEY` matches across apps
- Supabase service role key valid
- RLS policies allow access

### Billing not working

Check:
- Stripe webhook configured
- Price IDs match Stripe Dashboard
- Customer created in Stripe

## 📖 Full Documentation

See `AUREV_HQ_IMPLEMENTATION_COMPLETE.md` for detailed docs.

## 🎉 You're Done!

AUREV HQ is now live. Navigate to `/aurev-hq/dashboard` to see your unified ecosystem.

**Next:** Implement OpsGrid and AgentCloud sync endpoints to complete the trifecta! ⚡

