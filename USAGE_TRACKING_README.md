# Usage Tracking and Rate Limiting System

This system provides comprehensive usage tracking and rate limiting for email sending based on user subscription plans.

## Components

### 1. Database Schema

**Plans Table** (`plans`)
- `stripe_price_id`: Primary key linking to Stripe pricing
- `name`: Human-readable plan name
- `monthly_limit`: Maximum emails per month
- `rate_per_min`: Maximum emails per minute

**Usage Tracking** (`usage_monthly`)
- `user_id`: References auth.users
- `period_ym`: YYYY-MM format for monthly periods
- `sent_count`: Number of emails sent in the period
- `updated_at`: Last update timestamp

### 2. API Endpoints

**Plan Resolution** (`/api/plan/resolve`)
- POST endpoint that resolves user's active subscription
- Returns monthly limit and rate per minute
- Handles Stripe subscription lookup

**Usage Data** (`/api/usage`)
- GET endpoint for current user's usage
- Returns current month usage, limits, and rate limits
- Used by dashboard components

### 3. Edge Function Integration

The queue dispatcher (`supabase/functions/queue-dispatcher/index.ts`) has been enhanced with:

- **Plan-based rate limiting**: Checks monthly and per-minute limits before sending
- **Usage tracking**: Increments monthly usage counters after successful sends
- **Graceful deferral**: Jobs are rescheduled when limits are exceeded

### 4. UI Components

**UsageCard** (`src/components/UsageCard.tsx`)
- Displays current month usage with progress bar
- Shows rate limits
- Auto-refreshes usage data

## Setup Instructions

### 1. Run Database Migrations

```bash
# Apply the usage tracking schema
supabase db push
```

### 2. Configure Stripe Price IDs

Update the plan seeding in `supabase/migrations/20241220_usage_tracking.sql`:

```sql
insert into plans (stripe_price_id, name, monthly_limit, rate_per_min)
values
  ('price_your_basic_id','Basic',3000,60),
  ('price_your_pro_id','Pro',20000,300)
on conflict (stripe_price_id) do update
set name=excluded.name, monthly_limit=excluded.monthly_limit, rate_per_min=excluded.rate_per_min;
```

### 3. Environment Variables

Ensure these are set in your environment:

```bash
STRIPE_SECRET_KEY=sk_...
PUBLIC_BASE_URL=https://your-domain.com
```

### 4. Deploy Edge Function

```bash
supabase functions deploy queue-dispatcher
```

## Usage Examples

### Adding UsageCard to Dashboard

```tsx
import UsageCard from "@/components/UsageCard";

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1>Dashboard</h1>
      <UsageCard />
    </div>
  );
}
```

### Checking User Plan Programmatically

```tsx
import { getUserPlan } from "@/lib/plan";

const plan = await getUserPlan(userId);
if (plan) {
  console.log(`User has ${plan.name} plan with ${plan.monthly_limit} monthly limit`);
}
```

## Rate Limiting Behavior

### Monthly Limits
- When monthly limit is reached, jobs are deferred for 24 hours
- Jobs are marked with `last_error: "monthly_cap_reached"`

### Per-Minute Limits
- When rate limit is exceeded, jobs are deferred for 1 minute
- Jobs are marked with `last_error: "rate_limited"`

### Legacy Workspace Limits
- Existing workspace-based limits are preserved for backward compatibility
- Plan-based limits take precedence when available

## Monitoring

The system provides several ways to monitor usage:

1. **Real-time dashboard**: UsageCard component shows current usage
2. **Database queries**: Direct access to `usage_monthly` table
3. **Job status**: Failed jobs include error messages for limit violations

## Troubleshooting

### Common Issues

1. **Plan not found**: Ensure Stripe price IDs match between Stripe and database
2. **Usage not incrementing**: Check that `inc_monthly_usage` RPC function exists
3. **Rate limiting too aggressive**: Adjust `rate_per_min` values in plans table

### Debugging

Check the queue dispatcher logs for rate limiting decisions:

```sql
-- View recent jobs with rate limiting errors
SELECT id, user_id, status, last_error, scheduled_at 
FROM email_jobs 
WHERE last_error IN ('monthly_cap_reached', 'rate_limited')
ORDER BY created_at DESC;
```