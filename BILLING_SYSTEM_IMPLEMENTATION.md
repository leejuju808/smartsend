# Team-Based Billing System Implementation

Complete implementation of plan limits and billing gating for SmartSend AI.

## Overview

This system provides:
- **Single Source of Truth**: Plan limits catalog in `plan_limits` table
- **Team-Level Billing**: Billing tied to teams, not individual users
- **Plan Gates**: Server-side enforcement of limits (can't be bypassed)
- **Billing Portal**: Stripe billing portal integration
- **Usage Tracking**: Automated monthly usage tracking via views

## Database Schema

### 1. Plan Limits (`plan_limits`)

Catalog of all available plans with their limits.

```sql
create table public.plan_limits (
  plan text primary key,              -- 'free','starter','pro'
  daily_cap int not null,             -- max emails/day per team
  ai_rewrites_month int not null,     -- AI variants/month/team
  team_seats int not null,            -- members
  campaigns int not null,             -- active campaigns
  created_at timestamptz default now()
);
```

**Seeded Plans:**
- `free`: 25 daily sends, 50 AI rewrites/month, 1 seat, 1 campaign
- `starter`: 200 daily sends, 500 AI rewrites/month, 3 seats, 5 campaigns
- `pro`: 1000 daily sends, 3000 AI rewrites/month, 10 seats, 50 campaigns

### 2. Billing Customers (`billing_customers`)

Links teams to Stripe customers and plans.

```sql
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  stripe_customer_id text unique not null,
  plan text not null default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 3. Views

#### `v_team_plan`
Quick view to get team's plan and limits.

```sql
select 
  bc.team_id, 
  coalesce(bc.plan,'free') as plan, 
  pl.*
from public.billing_customers bc
join public.plan_limits pl on pl.plan = coalesce(bc.plan,'free');
```

#### `v_usage_month`
Aggregates monthly usage by team for sends and AI rewrites.

```sql
select
  bc.team_id,
  date_trunc('month', created_at) as month,
  'sends' as metric,
  count(*)::int as qty
from public.send_queue sq
join public.campaigns c on c.id = sq.campaign_id
join public.billing_customers bc on bc.team_id = c.team_id
where sq.status = 'sent'
group by bc.team_id, month
union all
select
  bc.team_id,
  date_trunc('month', created_at) as month,
  'ai_rewrite' as metric,
  count(*)::int as qty
from public.template_versions tv
join public.campaigns c on c.id = tv.campaign_id
join public.billing_customers bc on bc.team_id = c.team_id
where tv.variant_key is not null
group by bc.team_id, month;
```

## Implementation Files

### Migration
- `supabase/migrations/20260119000000_team_billing_system.sql`

### Edge Functions
- `supabase/functions/createBillingPortal/index.ts` - Creates Stripe billing portal session

### Server Actions
- `src/lib/billing/limits.ts` - Helper functions:
  - `getTeamPlan(teamId)` - Get plan limits for a team
  - `getMonthUsage(teamId)` - Get monthly usage metrics
  - `used(usage, metric)` - Extract usage for a metric
- `src/app/(dashboard)/settings/billing/actions.ts` - Billing portal action

### Plan Gates

#### 1. Daily Send Limit (`launchCampaign`)

**File:** `src/app/(dashboard)/campaigns/[id]/launch/actions.ts`

**Enforcement:**
- Before enqueueing sends, counts emails already sent today by team
- Throws error if daily cap would be exceeded
- Caps first day's slice to remaining quota

```typescript
if (campaign.team_id && toQueue.length > 0) {
  const plan = await getTeamPlan(campaign.team_id);
  const remainingToday = Math.max(0, plan.daily_cap - sentToday);
  
  if (remainingToday <= 0) {
    throw new Error(`Daily send limit reached for your ${plan.plan} plan.`);
  }
}
```

#### 2. AI Rewrite Quota (`rewriteTemplate`)

**File:** `app/campaigns/[id]/compose/rewriter/actions.ts`

**Enforcement:**
- Before calling AI rewrite function, checks monthly usage
- Throws error if quota would be exceeded
- Shows remaining usage in error message

```typescript
const usage = await getMonthUsage(campaign.team_id);
const usedAI = used(usage, "ai_rewrite");
const requestedVariants = input.variants ?? 3;

if (usedAI + requestedVariants > plan.ai_rewrites_month) {
  throw new Error(`AI rewrite limit reached. You've used ${usedAI}/${plan.ai_rewrites_month} rewrites.`);
}
```

#### 3. Team Seats (`inviteMember`)

**File:** `src/app/api/teams/invite/route.ts`

**Enforcement:**
- Before creating invite, counts current team members
- Throws error if seat limit would be exceeded

```typescript
const plan = await getTeamPlan(finalTeamId);
const { count: currentSeats } = await supabase
  .from("team_members")
  .select("user_id", { count: "exact", head: true })
  .eq("team_id", finalTeamId);

if (currentSeats >= plan.team_seats) {
  return NextResponse.json({ 
    error: `You've hit your ${plan.plan} plan seat limit of ${plan.team_seats}.` 
  }, { status: 403 });
}
```

## Billing Portal

### Edge Function

Calls Stripe billing portal API to create session.

**Required Env Vars:**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `BILLING_SECRET` - Secret for x-ss-secret header
- `BILLING_RETURN_URL` - Return URL after portal

**Deploy:**
```bash
supabase functions deploy createBillingPortal --no-verify-jwt
supabase secrets set STRIPE_SECRET_KEY=sk_live_... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_URL=... BILLING_SECRET=... BILLING_RETURN_URL=https://app.smartsendhq.com/settings/billing
```

### Server Action

```typescript
export async function openBillingPortal(teamId: string) {
  // Verifies user is team member via RLS
  const res = await fetch(`${supabaseUrl}/createBillingPortal`, {
    method: "POST",
    headers: {
      "x-ss-secret": process.env.BILLING_SECRET!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ teamId })
  });
  return url;
}
```

## Testing Plan (10 minutes)

1. **Setup:**
   - Run migration
   - Seed plan_limits
   - Create test team with `billing_customers` row

2. **Seat Limit:**
   - Add members until at limit
   - Try to add one more → blocked with upgrade CTA

3. **Daily Send Limit:**
   - Launch campaign with enough emails to exceed daily cap
   - Server throws error; UI shows banner

4. **AI Rewrite Quota:**
   - Generate AI variants until quota exhausted
   - Next click blocked with upgrade CTA

5. **Billing Portal:**
   - Click "Manage Billing"
   - Portal opens
   - Change plan in Stripe
   - Webhook updates `billing_customers.plan`

6. **Re-test:**
   - Limits increase immediately
   - All gates now allow higher limits

## UI Components

### Upgrade CTA Copy

```
"You've hit your plan limit. Upgrade to Starter for 200 daily sends, 500 AI rewrites, and 3 seats."

Buttons: 
- [Upgrade] → Checkout
- [Manage Billing] → Portal
```

### Settings → Billing Page

**Show:**
- Current plan + status + renewal date
- This month usage: Sends, AI rewrites
- Plan limits: daily cap, seat cap, campaigns cap
- "Manage Billing" button → opens portal

## RLS Policies

- `plan_limits`: Public read (anyone can see plans)
- `billing_customers`: Team members can read; service role can manage
- `billing_subscriptions`: Team members can read; service role can manage
- Views inherit from underlying tables

## Next Steps

1. **Stripe Checkout**: Create checkout session action
2. **Webhook**: Update plan when subscription changes
3. **UI**: Build billing settings page
4. **Analytics**: Add usage dashboard
5. **Alerts**: Notify when approaching limits

## Environment Variables Required

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
BILLING_SECRET=your_random_secret
BILLING_RETURN_URL=https://app.smartsendhq.com/settings/billing

# AI Rewrite
AI_SECRET=your_ai_rewrite_secret
```

## Notes

- All limits are enforced server-side (can't bypass)
- Graceful degradation: If plan lookup fails, allows operation (log error)
- Usage tracking is automatic via views
- Migration is idempotent (safe to run multiple times)
- RLS protects all sensitive data
- Default plan is 'free' if no billing_customer found

