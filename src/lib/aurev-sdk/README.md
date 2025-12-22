# AUREV OS SDK

Unified SDK for cross-module functionality across SmartSend, OpsGrid, and AgentCloud.

## Quick Start

```typescript
import { AUREVSDK } from "@/lib/aurev-sdk";

// Get current user
const user = await AUREVSDK.auth.getCurrentUser();

// Check module access
const hasAccess = await AUREVSDK.auth.hasModuleAccess("smartsend");

// Track an event
await AUREVSDK.analytics.track("campaign.sent", "smartsend", {
  campaign_id: "123",
  email_count: 500
});

// Get dashboard metrics
const metrics = await AUREVSDK.analytics.getDashboardMetrics();
```

## API Reference

### Auth Module

#### `getCurrentUser()`
Returns the current user's AUREV context.

```typescript
const user = await AUREVSDK.auth.getCurrentUser();
// Returns: AurevUser | null
```

#### `getActiveOrg()`
Gets the user's active organization.

```typescript
const org = await AUREVSDK.auth.getActiveOrg();
// Returns: { id: string, name: string } | null
```

#### `hasModuleAccess(module)`
Checks if user has access to a specific module.

```typescript
const hasAccess = await AUREVSDK.auth.hasModuleAccess("smartsend");
// Returns: boolean
```

#### `updatePreferences(preferences)`
Updates user preferences.

```typescript
await AUREVSDK.auth.updatePreferences({
  theme: "dark",
  notifications: { email: true }
});
// Returns: boolean
```

### Billing Module

#### `upgrade(plan, metadata?)`
Upgrades to a new plan via Stripe.

```typescript
const result = await AUREVSDK.billing.upgrade("price_xxx", {
  org_id: "123"
});
// Returns: { success: boolean, url?: string }
```

#### `getBillingStatus()`
Gets current billing status.

```typescript
const status = await AUREVSDK.billing.getBillingStatus();
// Returns: {
//   plan: string,
//   status: string,
//   current_period_end: number | null,
//   cancel_at_period_end: boolean
// } | null
```

### Analytics Module

#### `track(eventType, module, data?)`
Tracks an event across modules.

```typescript
await AUREVSDK.analytics.track("campaign.started", "smartsend", {
  campaign_id: "123",
  lead_count: 1000
});
// Returns: boolean
```

#### `getAnalytics(module, startDate?, endDate?)`
Gets analytics for a specific module.

```typescript
const analytics = await AUREVSDK.analytics.getAnalytics(
  "smartsend",
  new Date("2025-01-01"),
  new Date("2025-01-31")
);
// Returns: AurevAnalytics[]
```

#### `getModuleUsage()`
Gets usage stats for all modules.

```typescript
const usage = await AUREVSDK.analytics.getModuleUsage();
// Returns: AurevModule[]
```

#### `getDashboardMetrics()`
Gets unified dashboard metrics.

```typescript
const metrics = await AUREVSDK.analytics.getDashboardMetrics();
// Returns: {
//   total_revenue: number,
//   total_events: number,
//   smartsend_sends: number,
//   smartsend_replies: number,
//   opsgrid_workflows: number,
//   opsgrid_tasks: number,
//   agentcloud_messages: number,
//   agentcloud_agents: number
// }
```

## Types

```typescript
interface AurevUser {
  id: string;
  user_id: string;
  org_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  modules_enabled: string[];
  preferences: AurevPreferences;
  onboarding_complete: boolean;
}

interface AurevModule {
  id: string;
  org_id: string;
  module: "smartsend" | "opsgrid" | "agentcloud";
  status: "active" | "inactive" | "suspended";
  usage: Record<string, any>;
  settings: Record<string, any>;
}

interface AurevAnalytics {
  module: string;
  date: string;
  events_count: number;
  revenue_usd: number;
  // Module-specific fields
  smartsend_sends?: number;
  smartsend_replies?: number;
  opsgrid_workflows_run?: number;
  opsgrid_tasks_completed?: number;
  agentcloud_messages_sent?: number;
  agentcloud_agents_deployed?: number;
}
```

## Usage Examples

### Checking Module Access

```typescript
// In a SmartSend API route
import { AUREVSDK } from "@/lib/aurev-sdk";

export async function POST(req: Request) {
  const hasAccess = await AUREVSDK.auth.hasModuleAccess("smartsend");
  
  if (!hasAccess) {
    return NextResponse.json(
      { error: "Module not enabled" },
      { status: 403 }
    );
  }
  
  // Proceed with SmartSend logic
}
```

### Tracking Events

```typescript
// After sending a campaign
await AUREVSDK.analytics.track("campaign.completed", "smartsend", {
  campaign_id: campaign.id,
  emails_sent: campaign.emails_sent,
  replies_received: campaign.replies_count
});
```

### Dashboard Integration

```typescript
// Fetch unified metrics
const metrics = await AUREVSDK.analytics.getDashboardMetrics();

console.log(`Total revenue: $${metrics.total_revenue}`);
console.log(`SmartSend sends: ${metrics.smartsend_sends}`);
console.log(`OpsGrid workflows: ${metrics.opsgrid_workflows}`);
```

## Architecture

The SDK uses a singleton pattern:

```typescript
const aurev = new AUREV(); // Internal use
const aurev = getAUREV(); // Public use

// Or use convenience exports
AUREVSDK.auth.getCurrentUser();
```

This ensures:
- Single database connection
- Consistent state
- Better performance

## Database Schema

The SDK interacts with these tables:
- `aurev_users` — User context
- `aurev_modules` — Module status
- `aurev_analytics` — Aggregated metrics
- `aurev_events` — Event tracking

See `supabase/migrations/20251101000000_aurev_core_system.sql` for details.

## Error Handling

All SDK methods return `null` or `false` on error. Check the response:

```typescript
const user = await AUREVSDK.auth.getCurrentUser();
if (!user) {
  // Handle error
  return;
}

// Use user
```

## Security

- All requests use RLS policies
- User context validated on every call
- Stripe keys kept server-side
- No client-side SDK calls

## Testing

```typescript
// Mock the SDK for tests
jest.mock("@/lib/aurev-sdk");

const mockAUREVSDK = require("@/lib/aurev-sdk").AUREVSDK;
mockAUREVSDK.auth.getCurrentUser = jest.fn().mockResolvedValue(mockUser);
```

## Support

For issues or questions:
- Check the main docs: `AUREV_OS_IMPLEMENTATION_SUMMARY.md`
- See the roadmap: `AUREV_OS_EXECUTION_ROADMAP.md`
- Contact the product team

