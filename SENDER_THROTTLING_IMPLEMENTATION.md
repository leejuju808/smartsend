# Sender Account Throttling Implementation Guide

This guide documents the implementation of sender account throttling with warm-up ramps, hourly/daily caps, and pacing controls.

## Overview

The system enforces per-sender-account limits to protect email deliverability:
- **Hourly caps**: Maximum messages per hour per account
- **Daily caps**: Maximum messages per day per account  
- **Warm-up ramps**: Gradual daily volume increases for new accounts
- **Pacing**: Minimum time gaps between sends from the same account

## Database Schema

### 1. Sender Accounts Table

Created in migration: `supabase/migrations/20250101_sender_accounts_throttling.sql`

```sql
create table sender_accounts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text check (provider in ('gmail','outlook')) not null,
  email text not null,
  -- hard caps
  hourly_cap int default 40,
  daily_cap int default 300,
  -- warm-up ramp
  warmup_enabled boolean default true,
  warmup_start date default current_date,
  warmup_initial_daily int default 20,
  warmup_increment int default 20,
  warmup_max_daily int default 200,
  -- pacing
  min_gap_seconds int default 45,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, email)
);
```

### 2. Send Counters Table

Tracks hourly and daily usage per account:

```sql
create table send_counters (
  account_id uuid references sender_accounts(id) on delete cascade,
  period text check (period in ('hour','day')) not null,
  bucket timestamptz not null,
  count int not null default 0,
  primary key (account_id, period, bucket)
);
```

### 3. Campaign Logs Extension

Added `sender_account_id` to track which account sent each message:

```sql
alter table campaign_logs add column if not exists sender_account_id uuid references sender_accounts(id);
```

## Automatic Counter Updates

A PostgreSQL trigger automatically bumps counters when emails are logged:

```sql
create trigger trg_bump_send_counters
after insert on campaign_logs
for each row
when (new.direction is null or new.direction = 'outbound')
execute function bump_send_counters();
```

## Warm-up Calculation

The `sender_today_cap` function computes today's effective daily cap based on warm-up settings:

```sql
create or replace function sender_today_cap(account uuid)
returns int language sql stable as $$
  with cfg as (
    select warmup_enabled, warmup_start, warmup_initial_daily, warmup_increment, warmup_max_daily, daily_cap
    from sender_accounts where id = account
  )
  select case
    when (select warmup_enabled from cfg) is false
      then (select daily_cap from cfg)
    else
      least(
        (select warmup_max_daily from cfg),
        (select warmup_initial_daily from cfg) +
        greatest(0, (current_date - (select warmup_start from cfg))) * (select warmup_increment from cfg)
      )
  end as cap;
$$;
```

### Example Warm-up Schedule

With default settings (initial: 20/day, increment: 20/day, max: 200/day):
- Day 0: 20 emails
- Day 1: 40 emails
- Day 2: 60 emails
- ...
- Day 9: 200 emails (clamped)

## Queue Worker Integration

### Throttle State Retrieval

The queue worker checks current usage before sending:

```typescript
async function getThrottleState(supabase: any, accountId: string) {
  // Fetch account config
  const { data: acct } = await supabase
    .from("sender_accounts")
    .select("hourly_cap, daily_cap, min_gap_seconds, ...")
    .eq("id", accountId)
    .single()

  // Get current usage from counters
  const { data: counts } = await supabase
    .from("send_counters")
    .select("period, bucket, count")
    .eq("account_id", accountId)
    .in("period", ["hour", "day"])
    // ...filter to current hour/day buckets

  // Get warm-up cap
  const { data: cap } = await supabase.rpc("sender_today_cap", { account: accountId })

  // Get last send timestamp for pacing
  const { data: lastLog } = await supabase
    .from("campaign_logs")
    .select("created_at")
    .eq("sender_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)

  return { acct, hourCount, dayCount, warmupDailyCap, lastSentAtMs }
}
```

### Deferral Logic

Jobs are deferred if any limits would be exceeded:

```typescript
function computeDeferral(state) {
  const reasons = []
  let nextAt = now

  // Hourly cap check
  if (hourCount >= hourlyCap) {
    nextAt = startOfNextHour()
    reasons.push("hourly cap")
  }

  // Daily cap check (using warm-up adjusted cap)
  const effectiveDailyCap = Math.min(dailyCap, warmupDailyCap)
  if (dayCount >= effectiveDailyCap) {
    nextAt = tomorrow(8, 0, 0)  // 8 AM next day
    reasons.push(`daily cap (${effectiveDailyCap})`)
  }

  // Pacing check
  const nextGap = lastSentAt + (minGapSeconds * 1000)
  if (nextGap > now) {
    nextAt = Math.max(nextAt, nextGap)
    reasons.push("min gap")
  }

  return { shouldDefer: reasons.length > 0, nextAt, reasons }
}
```

## Integration with Email Sending

When logging successful sends to `campaign_logs`, include the sender account ID:

```typescript
await supabase.from("campaign_logs").insert({
  lead_id: leadId,
  campaign_id: campaignId,
  provider: "gmail",
  message_id: messageId,
  thread_id: threadId,
  subject,
  snippet,
  direction: "outbound",
  sender_account_id: selectedSenderAccountId,  // CRITICAL for counter updates
})
```

The trigger will automatically update `send_counters`.

## UI Integration (Optional)

### Sender Settings Page

Path: `/app/(dashboard)/settings/senders/page.tsx`

```typescript
export default async function SenderSettingsPage() {
  const supabase = getServerSupabase()
  const { data: accounts } = await supabase
    .from("sender_accounts")
    .select("*")
    .order("email")
  
  return <SenderSettingsClient accounts={accounts ?? []} />
}
```

### Settings Form

Allow users to configure:
- Hourly/daily caps
- Warm-up settings (enabled, start date, increments)
- Minimum gap between sends
- Account activation status

## Safety Recommendations

1. **During Warm-up**: Keep `hourly_cap ≤ 60` and `min_gap_seconds ≥ 30` to protect reputation
2. **Production**: Monitor send counters and adjust caps based on deliverability metrics
3. **Parallel Workers**: Ensure queue jobs use locking (e.g., `locked_by` field) to prevent race conditions

## Testing

1. Create a sender account with low caps (hourly: 5, daily: 10)
2. Queue multiple jobs for that account
3. Verify that only the allowed number sends immediately
4. Check that remaining jobs are deferred with appropriate timestamps
5. Confirm counters update correctly after each send

## Monitoring

Query current usage:
```sql
select 
  sa.email,
  sc.period,
  sc.bucket,
  sc.count,
  sa.hourly_cap,
  sa.daily_cap
from sender_accounts sa
join send_counters sc on sc.account_id = sa.id
where sc.bucket >= now() - interval '1 day'
order by sa.email, sc.bucket desc;
```

## Troubleshooting

### Counters not updating
- Verify `sender_account_id` is set when inserting to `campaign_logs`
- Check trigger exists: `select * from pg_trigger where tgname = 'trg_bump_send_counters'`
- Ensure trigger condition matches your data: `when (new.direction is null or new.direction = 'outbound')`

### Jobs not being throttled
- Confirm `sender_account_id` is included in queue jobs
- Check `getThrottleState` returns non-null data
- Verify `computeDeferral` logic is being called in queue worker

### Warm-up not working
- Verify `sender_today_cap` function exists and returns correct values
- Check `warmup_enabled` flag is true
- Confirm `warmup_start` date is set correctly 