# Block 20930 — SmartSend Deliverability Engine v1

## Implementation Summary

Block 20930 transforms SmartSend into a high-performance cold email engine built specifically for contractors. This deliverability engine ensures better inbox placement, fewer bounces, no spam red flags, and higher open/reply rates.

## Components Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block20930_deliverability_engine_v1.sql`)

- **Enhanced `email_events` table**: Added `organization_id`, `email_id`, `timestamp` columns and expanded `event_type` to include `delivered`, `bounced`, `complained`, `hard_bounce`, `soft_bounce`, `spam_complaint`
- **Enhanced `domain_settings` table**: Added DNS record details (`spf_record`, `dkim_record`, `dmarc_record`) and status fields (`spf_status`, `dkim_status`, `dmarc_status`)
- **Enhanced `domain_warmup_state` table**: Added `plan_type`, `progress_percentage` columns
- **New `deliverability_scores` table**: Tracks daily/weekly deliverability scores with components

### 2. Core Functions

- **`check_domain_dns()`**: DNS checker structure (called from API)
- **`calculate_deliverability_score_v2()`**: Block 20930 formula: `(1 - bounce_rate*4) * (1 - complaint_rate*10) * dkim_score * spf_score * warmup_stage`
- **`update_warmup_progress_v2()`**: Enhanced warm-up logic:
  - DAY 1-3: 15-25 emails/day
  - DAY 4-7: 30-50/day
  - DAY 8-14: 75-150/day
  - DAY 15+: Plan limits (Starter: 150, Growth: 300, Domination: 500)
- **`auto_pause_domain_v2()`**: Auto-pause when:
  - Bounce rate > 5%
  - Complaint rate > 0.3%
  - SPF/DKIM fail
  - DMARC missing AND bounce rate rising
- **`get_deliverability_status()`**: Returns comprehensive status for UI
- **`increment_warmup_sent()`**: Increments warm-up counters

### 3. API Endpoints

- **`/api/deliverability/dns-check`** (POST): Checks SPF/DKIM/DMARC records via DNS lookup
- **`/api/deliverability/status/[id]`** (GET): Returns deliverability status for a domain
- **`/api/webhooks/email-events-block20930`** (POST): Processes bounce/complaint events from providers

### 4. Safeguards Library (`src/lib/deliverability/block20930-safeguards.ts`)

- **`checkDeliverabilitySafeguards()`**: Comprehensive pre-send check:
  - Domain authentication (SPF/DKIM)
  - Sending paused status
  - Auto-pause threshold checks
  - Warm-up limit enforcement
  - Deliverability score threshold
- **`recordEmailEvent()`**: Records bounce/complaint/delivered events
- **`updateWarmupAfterSend()`**: Updates warm-up progress after sending

### 5. UI Components

- **`DeliverabilityStatus.tsx`**: Comprehensive deliverability status display:
  - Domain authentication status (SPF/DKIM/DMARC)
  - Deliverability score (0-100) with color coding
  - Bounce/complaint rates (30 days)
  - Warm-up progress and limits
  - Recommendations
  - Pause alerts

### 6. Integration Points

- **`src/app/api/send/route.ts`**: Integrated Block 20930 safeguards into email sending flow
- **`supabase/functions/mail-webhook/index.ts`**: Records bounce/complaint/delivered events

## Key Features

### Domain Authentication Checker

When a contractor connects a domain, SmartSend detects:
- ✅ SPF (TXT record at root domain)
- ✅ DKIM (TXT record at `selector._domainkey.domain`)
- ✅ DMARC (TXT record at `_dmarc.domain`)

Results displayed:
- Green = correct
- Yellow = partial/warning
- Red = missing

### Bounce + Complaint Tracking

Every email event is tracked:
- `delivered`: Email successfully delivered
- `bounced` / `hard_bounce` / `soft_bounce`: Bounce events
- `complained` / `spam_complaint`: Spam complaint events

If hard bounce rate > 5% → SmartSend automatically:
- Disables sending for that domain
- Alerts user
- Asks them to fix authentication

### Automatic Send-Pause Rules

SmartSend protects domain reputation by pausing campaigns if:
- Bounce rate > 5%
- Complaint rate > 0.3%
- SPF/DKIM fail
- DMARC missing AND bounce rate rising
- New domain with no warm-up

### Warm-Up Engine (SmartSend Auto-Warm)

Before SmartSend sends volume, warm-up is enforced:

**DAY 1-3**: 15-25 emails/day (spread evenly, no high-level personalization)
**DAY 4-7**: 30-50/day (include soft personalization)
**DAY 8-14**: 75-150/day (include more detailed personalization)
**DAY 15+**: Unlimited per plan
- Starter: cap 150/day
- Growth: cap 300/day
- Domination: cap 500/day

### Daily + Weekly Deliverability Score

SmartSend computes a health score using Block 20930 formula:

```
deliverability_score = 
  (1 - bounce_rate*4) * 
  (1 - complaint_rate*10) * 
  (dkim_score) *
  (spf_score) *
  (warmup_stage)
```

Display 0-100:
- **85-100**: Excellent
- **70-84**: Good
- **55-69**: Caution
- **<55**: Danger

## Usage

### Check DNS Records

```typescript
const response = await fetch('/api/deliverability/dns-check', {
  method: 'POST',
  body: JSON.stringify({
    domain: 'titanroofing.com',
    dkim_selector: 'smartsend',
    domain_settings_id: 'uuid'
  })
});
```

### Get Deliverability Status

```typescript
const response = await fetch('/api/deliverability/status/[domain_settings_id]');
const status = await response.json();
// Returns: domain, score, score_label, spf, dkim, dmarc, warmup, bounce_rate_30d, complaint_rate_30d
```

### Use Safeguards in Sending Logic

```typescript
import { checkDeliverabilitySafeguards } from '@/lib/deliverability/block20930-safeguards';

const check = await checkDeliverabilitySafeguards(orgId, fromEmail, toEmail);
if (!check.can_send) {
  // Block sending, show error message
}
```

### Display Deliverability Status in UI

```tsx
import { DeliverabilityStatus } from '@/components/deliverability/DeliverabilityStatus';

<DeliverabilityStatus domainSettingsId={domainSettingsId} />
```

## Database Functions

### Calculate Deliverability Score

```sql
SELECT calculate_deliverability_score_v2(
  'domain_settings_id'::uuid,
  'daily' -- or 'weekly'
);
```

### Update Warm-Up Progress

```sql
SELECT update_warmup_progress_v2('domain_settings_id'::uuid);
```

### Auto-Pause Domain

```sql
SELECT auto_pause_domain_v2('domain_settings_id'::uuid);
```

### Get Deliverability Status

```sql
SELECT get_deliverability_status('domain_settings_id'::uuid);
```

## System-Wide Safeguards

SmartSend now:

1. ✅ Blocks sending if domain not authenticated
2. ✅ Blocks sending if bounce too high
3. ✅ Limits cold emails if warm-up not complete
4. ✅ Messages user clearly when domain is unhealthy
5. ✅ Protects BOTH the customer AND SmartSend's reputation

## Benefits for Roofing Companies

- SmartSend protects their domain
- SmartSend monitors deliverability
- SmartSend enforces safe warm-up
- SmartSend prevents domain damage
- SmartSend increases booking rates
- SmartSend becomes more reliable
- SmartSend looks elite & professional
- Roofers close more deals

## Next Steps

1. Run migration: `supabase migration up`
2. Configure webhook endpoints for email providers
3. Add DNS check button in domain settings UI
4. Display deliverability status in Settings → Deliverability
5. Test warm-up flow with new domains
6. Monitor deliverability scores and auto-pause triggers

## Files Created/Modified

### New Files
- `supabase/migrations/20250130000001_block20930_deliverability_engine_v1.sql`
- `src/app/api/deliverability/dns-check/route.ts`
- `src/app/api/deliverability/status/[id]/route.ts`
- `src/lib/deliverability/block20930-safeguards.ts`
- `src/components/deliverability/DeliverabilityStatus.tsx`
- `src/app/api/webhooks/email-events-block20930/route.ts`

### Modified Files
- `src/app/api/send/route.ts` (integrated Block 20930 safeguards)
- `supabase/functions/mail-webhook/index.ts` (record events for Block 20930)

## Testing Checklist

- [ ] DNS check API works for SPF/DKIM/DMARC
- [ ] Deliverability score calculation is accurate
- [ ] Warm-up limits enforce correctly
- [ ] Auto-pause triggers at thresholds
- [ ] Bounce/complaint events are recorded
- [ ] UI displays status correctly
- [ ] Safeguards block sending when appropriate
- [ ] Warm-up progress updates after sending
















































