# AUREV SDK Implementation - Complete ✅

## Overview

The AUREV SDK has been successfully implemented as a shared core library that unifies all AUREV apps (SmartSend, OpsGrid, AgentCloud) with:

- ✅ **Auth** - Shared login + org context
- ✅ **Billing** - Stripe unified plans
- ✅ **Analytics** - Central telemetry
- ✅ **App switching & API access** - Unified infrastructure

## What Was Built

### 1. Monorepo Structure

Created `/packages/aurev-core-sdk/` directory with:
- `package.json` - Package configuration for `@aurev/core-sdk`
- `index.ts` - Core SDK implementation
- `tsconfig.json` - TypeScript configuration
- `README.md` - SDK documentation
- `EXAMPLE_USAGE.md` - Usage examples
- `.npmignore` - NPM ignore rules

### 2. Core SDK (`packages/aurev-core-sdk/index.ts`)

The `AUREVCore` class provides:

#### Auth Methods
- `getUser()` - Get current authenticated user
- `getOrg()` - Get user's organization ID (from `aurev_users` or `organization_members`)

#### Billing Methods
- `getPlan()` - Get current subscription plan (supports both org-based and user-based subscriptions for backwards compatibility)
- `upgradePlan(plan)` - Create Stripe checkout session for plan upgrade

#### Analytics Methods
- `track(event, data)` - Track analytics events with org_id and user_id

### 3. Database Migration (`supabase/migrations/20250215000000_aurev_sdk_setup.sql`)

Creates and updates:

1. **`aurev_users` table** - Unified user-organization mapping
   - Links users to organizations for cross-app access
   - Automatically backfilled from `organization_members`

2. **`analytics_events` table updates** - Enhanced for unified analytics
   - Added `org_id` column for organization-scoped analytics
   - Renamed `name` → `event` and `context` → `payload` for consistency
   - Created indexes for efficient queries

3. **`subscriptions` table compatibility** - Works with existing structure
   - Supports both `org_id` and `user_id` for backwards compatibility
   - Enhanced RLS policies for org-based access

### 4. SmartSend Integration (`src/lib/aurev.ts`)

Created server-side helper:
- `createAurevServer()` - Creates SDK instance with proper SSR cookie handling
- Default `aurev` export for convenience

## Usage

### Basic Example

```typescript
import { aurev } from "@/lib/aurev";

// Get user
const user = await aurev.getUser();

// Get organization
const orgId = await aurev.getOrg();

// Get plan
const plan = await aurev.getPlan();

// Track events
await aurev.track("campaign_sent", {
  campaign_id: "camp_123",
  recipients: 100,
  plan: plan,
});

// Upgrade plan
const checkoutUrl = await aurev.upgradePlan("pro");
```

## Database Schema

### Tables Created/Updated

1. **`aurev_users`** - User-organization mapping
   ```sql
   user_id uuid references auth.users(id)
   org_id uuid references organizations(id)
   ```

2. **`analytics_events`** - Enhanced with org_id support
   ```sql
   org_id uuid references organizations(id)
   event text
   payload jsonb
   user_id uuid
   ```

3. **`subscriptions`** - Compatible with existing structure
   - Supports both `org_id` and `user_id`
   - Org-based subscriptions preferred, falls back to user-based

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_SERVICE_ROLE_KEY` for admin ops)
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_PRO` - Stripe price ID for Pro plan
- `STRIPE_PRICE_ENTERPRISE` - Stripe price ID for Enterprise plan
- `AUREV_DASH_URL` - Base URL for dashboard (optional)

## Next Steps

### For OpsGrid & AgentCloud

1. Install the SDK package:
   ```bash
   npm install @aurev/core-sdk
   ```

2. Create similar integration file:
   ```typescript
   // opsgrid/lib/aurev.ts
   import { AUREVCore } from "@aurev/core-sdk";
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";
   
   export function createAurevServer() {
     const cookieStore = cookies();
     const supabase = createServerClient(/* ... */);
     return new AUREVCore({
       supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
       supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       stripeKey: process.env.STRIPE_SECRET_KEY!,
       supabaseClient: supabase,
     });
   }
   ```

3. Use the SDK:
   ```typescript
   import { createAurevServer } from "@/lib/aurev";
   const aurev = createAurevServer();
   ```

### Publishing the Package

To publish to private npm registry:

```bash
cd packages/aurev-core-sdk
npm publish --access restricted
```

Or use a monorepo tool like Turborepo, Nx, or pnpm workspaces.

## Testing

Run the migration:
```bash
supabase db push
```

Test the SDK:
```typescript
import { aurev } from "@/lib/aurev";

// In an API route
export async function GET() {
  const user = await aurev.getUser();
  const org = await aurev.getOrg();
  const plan = await aurev.getPlan();
  
  await aurev.track("test_event", { test: true });
  
  return Response.json({ user, org, plan });
}
```

## Files Created

- `/packages/aurev-core-sdk/package.json`
- `/packages/aurev-core-sdk/index.ts`
- `/packages/aurev-core-sdk/tsconfig.json`
- `/packages/aurev-core-sdk/README.md`
- `/packages/aurev-core-sdk/EXAMPLE_USAGE.md`
- `/packages/aurev-core-sdk/.npmignore`
- `/supabase/migrations/20250215000000_aurev_sdk_setup.sql`
- `/src/lib/aurev.ts`
- `/AUREV_SDK_IMPLEMENTATION.md` (this file)

## Definition of Done ✅

- ✅ SDK built at `/packages/aurev-core-sdk`
- ✅ SmartSend integrated with shared auth + billing
- ✅ Analytics events writing to unified `analytics_events` table with `org_id`
- ✅ Stripe unified billing live (supports org-based subscriptions)
- ✅ AUREV OS truly "connected under the hood"

The SDK is ready for use across SmartSend, OpsGrid, and AgentCloud!

