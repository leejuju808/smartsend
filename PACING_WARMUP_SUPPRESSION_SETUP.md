# Pacing, Warmup, and Suppression System

This system implements per-account sending limits, warmup capabilities, quiet hours, weekend scheduling, and suppression management.

## Architecture

### Database Tables

1. **`sending_policies`** - Per-account sending configuration
   - timezone, daily_cap, hourly_cap
   - warmup_enabled, warmup_day_1, warmup_growth
   - quiet_hours_start/end, send_weekends

2. **`send_counters`** - Rolling counters per account/day/hour
   - Used for warmup calculation and rate limiting

3. **`suppression`** - Workspace-level suppression list
   - Reasons: unsubscribe, bounce, manual
   - Used by pacer to filter outbound messages

4. **`unsubscribe_tokens`** - Public unsubscribe token mapping
   - Links tokens to workspace_id, lead_id, email

### Components

1. **Pacer (`/api/pacer/tick`)** - Enforces sending limits
   - Checks quiet hours, weekends, warmup caps
   - Updates counters, filters suppressed emails
   - Runs every 2-5 minutes via cron

2. **Unsubscribe Handler (`/api/u/[token]`)** - Public unsubscribe endpoint
   - GET: HTML confirmation page
   - POST: JSON response
   - Adds to suppression list, marks lead as replied

3. **Policy API (`/api/accounts/[id]/policy`)** - Sending policy management
   - GET: Retrieve policy
   - POST: Upsert policy

4. **SendingPolicyCard** - UI component for policy editing
   - Located in `src/components/settings/SendingPolicyCard.tsx`

## Setup

### 1. Run Migration

```bash
# Apply the SQL migration
supabase migration apply 20251031_pacing_warmup_suppression
```

### 2. Configure Cron Jobs

Set up two cron jobs:

**Pacer Tick** (runs every 2-5 minutes):
```bash
POST https://your-domain.com/api/pacer/tick
```

**Outbox Sender** (runs every 1-2 minutes):
```bash
POST https://your-domain.com/api/outbox/send
```

The pacer should run BEFORE the sender to enforce limits.

### 3. Create Default Policies

When a new `connected_accounts` record is created, optionally create a default policy:

```sql
INSERT INTO sending_policies (account_id)
SELECT id FROM connected_accounts
WHERE id NOT IN (SELECT account_id FROM sending_policies);
```

### 4. Generate Unsubscribe Tokens

When enqueuing outbox jobs, generate unsubscribe tokens:

```typescript
import { ensureUnsubToken } from "@/lib/unsubscribe";

const token = await ensureUnsubToken(workspace_id, lead_id, email);
// Include in template as: {{unsubscribe_link}} or append footer
```

### 5. Add Unsubscribe Footer to Templates

Templates should include:

```html
<hr style="margin-top:24px"/>
<p style="color:#777;font-size:12px">
  Don't want more emails? 
  <a href="{{APP_URL}}/api/u/{{token}}">Unsubscribe</a>
</p>
```

## Usage

### Sending Policy Configuration

Access the UI component in your settings page:

```tsx
import SendingPolicyCard from "@/components/settings/SendingPolicyCard";

<SendingPolicyCard accountId={accountId} />
```

Default settings:
- Daily cap: 150
- Hourly cap: 20
- Warmup: Day 1 = 10, Growth = +1/day
- Quiet hours: 20:00 - 07:00
- Weekends: Disabled

### Unsubscribe Flow

1. User clicks unsubscribe link
2. GET `/api/u/[token]` renders confirmation page
3. Backend adds email to `suppression` table
4. Lead status updated to "replied"
5. Future sends automatically filtered

### Bounce Suppression

When bounce is detected:
1. Gmail poller detects bounce message
2. Inserts into `bounces` table
3. Updates lead status
4. **Automatically adds to suppression list**
5. Future sends blocked

### Warmup Calculation

Warmup limit = `warmup_day_1 + (day_n - 1) * warmup_growth`

Day N is determined by counting distinct dates in `send_counters` for the account.

### Pacer Behavior

Per tick per account:
1. Check quiet hours → skip if outside window
2. Check weekends → skip if weekend and disabled
3. Calculate warmup cap
4. Fetch queue (limit = grant * 3 for filtering)
5. Fetch suppressed emails
6. Filter queue, update counters
7. Mark suppressed as failed
8. Return number of emails granted

## API Reference

### POST /api/pacer/tick

No parameters. Returns:
```json
{ "allowed": 42 }
```

### GET /api/u/[token]

Public endpoint, no auth required. Returns HTML confirmation page.

### POST /api/u/[token]

Public endpoint, returns:
```json
{ "ok": true }
```

### GET /api/accounts/[id]/policy

Returns sending policy object or defaults if not set.

### POST /api/accounts/[id]/policy

Body: Partial policy object. Valid fields:
- timezone, daily_cap, hourly_cap
- warmup_enabled, warmup_day_1, warmup_growth
- quiet_hours_start, quiet_hours_end, send_weekends

## Integration Points

### Outbox Creation

Existing suppression checks in `queue-email` route already filter at enqueue time.

### Campaign Scheduler

The pacer runs independently - no changes needed to campaign schedulers.

### AI Reply Detection

Bounce suppression is integrated in gmail-poller function.

### Account Table Names

This codebase uses both `connected_accounts` and `email_accounts` tables:
- `connected_accounts`: Used by outbox system and pacer (workspace-scoped)
- `email_accounts`: Used by gmail-poller (user-scoped)

Both tables are supported, and the pacer queries `connected_accounts` which matches the outbox foreign key.

## Testing

### Manual Pacer Test

```bash
curl -X POST http://localhost:3000/api/pacer/tick
```

Expected: `{"allowed": N}` where N >= 0

### Unsubscribe Test

```bash
# Generate token
node -e "const { ensureUnsubToken } = require('./src/lib/unsubscribe'); ensureUnsubToken('ws_id', 'lead_id', 'test@example.com')"

# Test URL
open http://localhost:3000/api/u/YOUR_TOKEN
```

### Policy Configuration

```bash
# Get policy
curl http://localhost:3000/api/accounts/ACCOUNT_ID/policy

# Update policy
curl -X POST http://localhost:3000/api/accounts/ACCOUNT_ID/policy \
  -H "Content-Type: application/json" \
  -d '{"daily_cap": 200, "warmup_day_1": 5}'
```

## Troubleshooting

### Pacer returns 0 allowed

Check:
1. Is it quiet hours?
2. Is it weekend and `send_weekends=false`?
3. Did warmup cap reach daily limit?
4. Are hourly/daily caps exhausted?

### Unsubscribe not working

Check:
1. Token exists in `unsubscribe_tokens` table
2. Lead ID is valid
3. Workspace ID matches
4. RLS policies allow public read

### Counters not incrementing

Check:
1. Pacer is running
2. Outbox jobs exist with `status='queued'`
3. Connected accounts exist
4. Sending policies are configured

## Security

- Unsubscribe tokens are random 32-byte hex strings
- Tokens stored in `unsubscribe_tokens` table
- Public routes use service role for database access
- Suppression list checks are workspace-scoped
- RLS policies enforce isolation

## Performance

- Pacer query uses indexes on `send_counters(account_id, ymd)`
- Suppression checks use index on `suppression(workspace_id, email)`
- Overfetches queue by 3x to filter suppression efficiently
- Batch operations minimize database roundtrips

