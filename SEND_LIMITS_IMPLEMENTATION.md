# Send Limits and Rate Limiting Implementation

## Overview

This implementation adds per-workspace sending limits, usage tracking, and jitter-based rate limiting to the email sending worker.

## Database Schema

### Tables

1. **send_settings** - Per-workspace sending limits
   - `workspace_id` (uuid, primary key)
   - `hourly_cap` (int, default: 50)
   - `daily_cap` (int, default: 200)
   - `jitter_ms_min` (int, default: 500)
   - `jitter_ms_max` (int, default: 2500)
   - `updated_at` (timestamptz)

2. **send_usage** - Hourly usage tracking
   - `workspace_id` (uuid)
   - `ymd` (date)
   - `hour` (int, 0-23)
   - `count` (int, default: 0)
   - Primary key: (workspace_id, ymd, hour)

### Functions

- `increment_send_usage(p_workspace_id, p_ymd, p_hour, p_n)` - Atomic increment for usage tracking
- `get_send_usage_counts(p_workspace_id, p_ymd, p_hour)` - Get current usage counts

## API Routes

### `/api/send-settings/update` (POST)

Update workspace send settings.

**Request:**
```json
{
  "workspaceId": "uuid",
  "hourly_cap": 50,
  "daily_cap": 200,
  "jitter_ms_min": 500,
  "jitter_ms_max": 2500
}
```

**Response:**
```json
{ "ok": true }
```

### `/api/send-settings/get` (POST)

Get workspace send settings.

**Request:**
```json
{
  "workspaceId": "uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "settings": {
    "workspace_id": "uuid",
    "hourly_cap": 50,
    "daily_cap": 200,
    "jitter_ms_min": 500,
    "jitter_ms_max": 2500
  }
}
```

## Worker Implementation

The `supabase/functions/sendWorker/index.ts` has been enhanced with:

1. **Rate limiting checks** - Before sending each email
2. **Jitter application** - Random delay between 500ms-2500ms
3. **Capacity reservation** - Atomic increment before sending
4. **Backoff guardrail** - +60min delay after 3 failed attempts

### Flow

1. Load workspace settings (defaults if not set)
2. Get current hour/day usage counts
3. If caps exceeded, reschedule to next hour
4. Reserve capacity (increment usage counter)
5. Apply jitter delay
6. Send email
7. On failure, apply exponential backoff + penalty

## UI Component

Created `src/components/SendSettings.tsx` - A simple form to manage:
- Hourly cap
- Daily cap
- Jitter minimum/maximum (in milliseconds)

## QA Checklist

### Test 1: Basic Cap Enforcement

1. Set `hourly_cap=3, daily_cap=5` in Settings UI
2. Enqueue 10 jobs (via "Retry Selected" or queue endpoint)
3. Run worker
4. **Expected:** Process 3 jobs, push 7 to next hour with `hourly_cap_reached` error

### Test 2: Daily Cap Enforcement

1. With same limits, process enough jobs to hit daily cap
2. **Expected:** Remaining jobs rescheduled with `daily_cap_reached` error

### Test 3: Jitter Verification

1. Check timestamps between sent logs
2. **Expected:** Delays vary between ~0.5s-2.5s (500ms-2500ms)

### Test 4: Capacity Increase

1. Lower `hourly_cap` to 10
2. Re-run worker
3. **Expected:** Throughput increases proportionally

### Test 5: Backoff Guardrail

1. Send to invalid email (hard failure)
2. Let it retry 3+ times
3. **Expected:** After 3rd attempt, next retry is delayed by +60 minutes beyond normal backoff

## Database Migration

The migration file `supabase/migrations/20251027_send_limits.sql` creates:
- Tables: `send_settings`, `send_usage`
- Functions: `increment_send_usage`, `get_send_usage_counts`
- Indexes for performance

Apply with:
```bash
supabase db reset  # or run migration manually
```

## Integration

To integrate the UI component:

```tsx
import SendSettings from "@/components/SendSettings";

// In your settings page:
<SendSettings workspaceId={currentWorkspaceId} />
```

## Configuration

Default settings (safe for deliverability):
- Hourly: 50 emails/hour
- Daily: 200 emails/day  
- Jitter: 500ms-2500ms between sends

Adjust based on your deliverability needs and sender reputation.
