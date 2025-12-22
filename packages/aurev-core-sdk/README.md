# @aurev/core-sdk

Unified core SDK for all AUREV applications (SmartSend, OpsGrid, AgentCloud).

This package provides shared functionality for:
- **Auth** - Shared login + org context
- **Billing** - Stripe unified plans
- **Analytics** - Central telemetry
- **App switching & API access** - Unified API access

## Installation

```bash
npm install @aurev/core-sdk
```

## Usage

### Basic Setup

```typescript
import { AUREVCore } from "@aurev/core-sdk";

const aurev = new AUREVCore({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  stripeKey: process.env.STRIPE_SECRET_KEY!,
});
```

### Auth

```typescript
// Get current user
const user = await aurev.getUser();

// Get user's organization
const orgId = await aurev.getOrg();
```

### Billing

```typescript
// Get current plan
const plan = await aurev.getPlan(); // Returns: "free" | "pro" | "enterprise"

// Upgrade to a plan
const checkoutUrl = await aurev.upgradePlan("pro");
window.location.href = checkoutUrl;
```

### Analytics

```typescript
// Track events
await aurev.track("campaign_sent", {
  campaign_id: "123",
  recipients: 100,
  org_id: aurev.org_id,
});
```

## Environment Variables

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key (for client) or service role key (for server)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_PRICE_PRO` - Stripe price ID for Pro plan
- `STRIPE_PRICE_ENTERPRISE` - Stripe price ID for Enterprise plan
- `AUREV_DASH_URL` - Base URL for AUREV dashboard (optional, defaults to `NEXT_PUBLIC_APP_URL`)

## Database Schema

The SDK expects these tables:

- `aurev_users` - User-organization mapping
- `organizations` - Organization data
- `subscriptions` - Billing subscriptions (supports both `org_id` and `user_id`)
- `analytics_events` - Analytics event tracking (supports `org_id` and `event`/`payload`)

See the migration file for setup: `supabase/migrations/20250215000000_aurev_sdk_setup.sql`

## License

Private - AUREV Internal Use Only

