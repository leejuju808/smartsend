# Events Tracking System Implementation

## Overview
This document outlines the implementation of a comprehensive events tracking system for SmartSend AI, designed to track key user actions and business metrics.

## 1. Database Schema

### Events Table
```sql
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_events_user on public.events (user_id);
create index if not exists idx_events_event on public.events (event);
```

**Migration File**: `supabase/migrations/20250122_create_events_table.sql`

## 2. Events Tracking Helper

**File**: `src/lib/events.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Client-Info": "smartsend/events" } } }
  );
}

export async function recordEvent(userId: string | null, event: string, meta: any = {}) {
  const sb = getClient();
  await sb.from("events").insert({ user_id: userId, event, meta });
}
```

## 3. Analytics Dashboard

**File**: `src/app/dashboard/analytics/page.tsx`

```typescript
import { supabaseAdmin } from "@/server/supabase";

export default async function AnalyticsPage() {
  const { data } = await supabaseAdmin
    .from("events")
    .select("event, count:id")
    .group("event");
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Analytics</h1>
      <table className="border w-full">
        <thead><tr><th className="p-2 text-left">Event</th><th className="p-2">Count</th></tr></thead>
        <tbody>
          {data?.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.event}</td>
              <td className="p-2 text-center">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Navigation**: Added to both mobile and desktop dashboard navigation after "Overview"

## 4. Event Tracking Implementation

### Signup Events
**File**: `src/app/auth/callback/route.ts`
- **Event**: `signup`
- **Metadata**: `{ email: user.email }`
- **Trigger**: When new user completes signup and workspace is created

### Contact Import Events
**File**: `src/app/api/contacts/import/route.ts`
- **Event**: `contacts_imported`
- **Metadata**: `{ count: inserted }`
- **Trigger**: After successful CSV import of contacts

### Checkout Events
**File**: `src/app/api/billing/checkout/route.ts`
- **Event**: `checkout_initiated`
- **Metadata**: `{}`
- **Trigger**: When Stripe checkout session is created

### Subscription Events
**File**: `src/app/api/webhooks/stripe/route.ts`
- **Event**: `subscribed_pro`
- **Metadata**: `{ stripe_sub: sub.id }`
- **Trigger**: When Stripe webhook receives `customer.subscription.created`

## 5. Testing

**Test File**: `tests/events.test.ts`

Tests verify:
- Events are recorded with correct parameters
- Null user IDs are handled properly
- Supabase client integration works correctly

## 6. Usage Examples

### Recording Events
```typescript
import { recordEvent } from '@/lib/events';

// User action
await recordEvent(user.id, "email_sent", { template_id: "123" });

// Anonymous action
await recordEvent(null, "page_view", { page: "/pricing" });

// Business event
await recordEvent(user.id, "upgrade_clicked", { plan: "pro" });
```

### Viewing Analytics
Navigate to `/dashboard/analytics` to see:
- Event counts by type
- Total event volume
- User engagement metrics

## 7. Deployment Steps

1. **Run Migration**: Apply the events table migration
   ```bash
   npx supabase db push
   ```

2. **Verify Events**: Check that events are being recorded
   ```sql
   SELECT * FROM events ORDER BY created_at DESC LIMIT 10;
   ```

3. **Test Analytics**: Visit `/dashboard/analytics` to verify dashboard works

## 8. Future Enhancements

- **Event Filtering**: Add date range and user filtering
- **Event Categories**: Group events by type (user, business, system)
- **Real-time Updates**: WebSocket integration for live analytics
- **Export Functionality**: CSV/JSON export of event data
- **Custom Dashboards**: User-configurable analytics views

## 9. Monitoring & Maintenance

- **Event Volume**: Monitor daily event counts
- **Performance**: Ensure events table doesn't impact app performance
- **Storage**: Consider archiving old events for cost optimization
- **Privacy**: Ensure sensitive data isn't logged in event metadata

## 10. Troubleshooting

### Common Issues
- **Events not recording**: Check Supabase permissions and environment variables
- **Analytics not loading**: Verify `supabaseAdmin` client configuration
- **Performance issues**: Check database indexes and query optimization

### Debug Commands
```sql
-- Check recent events
SELECT event, count(*) FROM events GROUP BY event ORDER BY count DESC;

-- Check user-specific events
SELECT * FROM events WHERE user_id = 'user-uuid' ORDER BY created_at DESC;

-- Check event metadata
SELECT event, meta FROM events WHERE meta IS NOT NULL LIMIT 10;
``` 