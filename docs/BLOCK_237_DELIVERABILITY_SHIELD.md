# Block 237: SmartSend Deliverability Shield v1

## Overview

SmartSend Deliverability Shield v1 provides a comprehensive protective layer for email sending, ensuring domain health and inbox safety. This system implements daily send limits, domain warmup curves, bounce protection, reputation scoring, spam detection, and smart mailbox rotation.

## Components Implemented

### 1. Database Migration (`supabase/migrations/20250130000001_deliverability_shield_v1.sql`)

**New Columns Added to `mailboxes` table:**
- `send_limit_daily` (INTEGER, default: 200) - Soft daily send limit
- `warmup_active` (BOOLEAN, default: true) - Whether warmup is active
- `warmup_level` (INTEGER, default: 1) - Current warmup level (1-10)
- `reputation_score` (INTEGER, default: 100) - Reputation score 0-100
- `bounces_today` (INTEGER, default: 0) - Bounce count for today
- `sends_today` (INTEGER, default: 0) - Send count for today
- `last_reset` (DATE, default: CURRENT_DATE) - Last reset date
- `paused` (BOOLEAN, default: false) - Whether mailbox is paused

**New Tables:**
- `template_risk_scores` - Tracks template risk scores
- `bounce_events` - Records bounce events for analysis

**Database Functions:**
- `get_warmup_limit(p_warmup_level)` - Returns warmup limit for a level
- `can_mailbox_send(p_mailbox_id)` - Checks if mailbox can send
- `increment_mailbox_sends(p_mailbox_id, p_increment)` - Increments send counter
- `increment_mailbox_bounces(p_mailbox_id, p_increment)` - Increments bounce counter
- `check_and_pause_mailbox(p_mailbox_id)` - Pauses mailbox if bounce rate too high
- `reset_mailbox_daily()` - Resets daily counters and progresses warmup
- `get_least_used_mailbox(p_user_id)` - Returns least used mailbox for rotation

**Cron Job:**
- Scheduled daily reset at 1 AM UTC via `cron.schedule`

### 2. Warmup Curve (`lib/deliverability/warmupCurve.ts`)

**Warmup Curve:**
```
Day 1:  10 emails/day
Day 2:  20 emails/day
Day 3:  30 emails/day
Day 4:  40 emails/day
Day 5:  60 emails/day
Day 6:  80 emails/day
Day 7:  100 emails/day
Day 8:  120 emails/day
Day 9:  150 emails/day
Day 10: 200 emails/day
```

**Functions:**
- `getWarmupLimit(warmupLevel)` - Get limit for warmup level
- `getEffectiveDailyLimit()` - Get effective limit considering warmup

### 3. Spam Risk Detector (`lib/deliverability/spamRiskScore.ts`)

**High-Risk Keywords Detected:**
- free, guaranteed, act now, urgent, amazing offer, limited time, cheap
- free money, winner, earn $, risk-free, no obligation, click here
- buy now, limited offer, exclusive deal, once in a lifetime, act fast
- don't delete, congratulations, you've won, claim now, expires soon
- order now, special promotion

**Risk Scoring:**
- 0-30: Low risk
- 31-60: Medium risk
- 61-100: High risk

**Features:**
- Detects spam keywords
- Checks excessive capitalization
- Detects excessive exclamation marks
- Counts links and images
- Validates subject/body length

### 4. Mailbox Safety Checks (`lib/deliverability/mailboxSafety.ts`)

**Functions:**
- `getMailbox(mailboxId)` - Get mailbox with safety metadata
- `checkMailboxSafety(mailboxId)` - Comprehensive safety check
- `isDailyLimitReached(mailboxId)` - Check if daily limit reached
- `isMailboxPaused(mailboxId)` - Check if mailbox is paused
- `checkBounceRate(mailboxId)` - Check and pause if bounce rate > 5%
- `recordBounce()` - Record bounce event
- `recordSend()` - Record successful send

### 5. Smart Rotation (`lib/deliverability/smartRotation.ts`)

**Features:**
- `getAvailableMailboxes(userId)` - Get all available mailboxes
- `pickLeastUsedMailbox(userId)` - Select least used mailbox
- `selectMailboxForSend(userId)` - Smart selection with safety checks

**Rotation Logic:**
- Selects mailbox with lowest `sends_today`
- Only considers active, non-paused mailboxes
- Verifies mailbox can still send before selection

### 6. Send Queue Dispatcher (`lib/sendQueue.ts`)

**Functions:**
- `canSendFromMailbox(mailboxId)` - Check if mailbox can send
- `getMailboxForLead(userId, leadId)` - Get mailbox for lead with checks
- `checkTemplateRisk(subject, body)` - Check template risk score
- `processSendQueueItem()` - Process queue item with all safety checks

**Safety Checks:**
1. Template risk assessment
2. Mailbox availability check
3. Daily limit check
4. Warmup limit check
5. Bounce rate check

### 7. Daily Reset Cron Job (`supabase/functions/reset-mailbox-daily/index.ts`)

**Functionality:**
- Resets `sends_today` to 0
- Resets `bounces_today` to 0
- Updates `last_reset` to current date
- Progresses `warmup_level` if warmup is active
- Auto-resumes paused mailboxes if no activity

**Schedule:** Runs daily at 1 AM UTC

### 8. UI Components

#### Deliverability Shield Panel (`src/components/deliverability/DeliverabilityShieldPanel.tsx`)

**Features:**
- Shows all mailboxes with safety metrics
- Displays warmup level and progress
- Shows daily send usage with progress bar
- Reputation score with color coding
- Bounce rate monitoring
- Status badges (ACTIVE, PAUSED, HIGH BOUNCE)
- Warning alerts for high bounce rates

**Metrics Displayed:**
- Email address and provider
- Warmup level and limit
- Sends today / Daily limit
- Remaining sends
- Reputation score (0-100)
- Bounce rate percentage
- Last reset date

#### Campaign Safety Warnings (`src/components/campaigns/CampaignSafetyWarnings.tsx`)

**Features:**
- Pre-launch safety checks
- Template risk assessment
- Mailbox warmup status
- Daily limit verification
- Estimated inbox placement percentage
- Warning messages for issues

**Checks Performed:**
- ✅ Mailbox warmup OK
- ✅ Daily limit OK
- ⚠️ Template risk score
- ✅ Estimated inbox placement

## Integration Points

### Send Dispatcher Integration

The deliverability shield integrates with existing send dispatchers:

1. **Before Queueing:**
   - Check template risk score
   - Verify mailbox availability
   - Check daily limits

2. **During Sending:**
   - Record successful sends
   - Record bounce events
   - Monitor bounce rates

3. **After Sending:**
   - Increment send counters
   - Check and pause if bounce rate exceeds 5%

### Bounce Protection

**Automatic Pause:**
- If bounce rate > 5%, mailbox is automatically paused
- Paused mailboxes cannot send until manually resumed
- Bounce events are tracked in `bounce_events` table

**Bounce Tracking:**
- Hard bounces
- Soft bounces
- Complaints

### Warmup Progression

**Automatic Progression:**
- Warmup level increases daily (if warmup is active)
- Maximum level is 10 (200 emails/day)
- Effective limit = min(send_limit_daily, warmup_limit)

## Usage Examples

### Check if Mailbox Can Send

```typescript
import { checkMailboxSafety } from '@/lib/deliverability/mailboxSafety';

const safety = await checkMailboxSafety(mailboxId);
if (safety.canSend) {
  // Proceed with sending
} else {
  console.log('Cannot send:', safety.reason);
}
```

### Check Template Risk

```typescript
import { checkTemplateRisk } from '@/lib/sendQueue';

const risk = checkTemplateRisk(subject, body);
if (risk.isHighRisk) {
  console.warn('High risk template:', risk.highRiskWords);
}
```

### Select Mailbox for Send

```typescript
import { selectMailboxForSend } from '@/lib/deliverability/smartRotation';

const result = await selectMailboxForSend(userId);
if (result.mailboxId) {
  // Use result.mailboxId for sending
}
```

## UI Integration

### Settings Page

The Deliverability Shield panel is integrated into:
- `app/(dashboard)/settings/deliverability/page.tsx`

### Campaign Launch

The Campaign Safety Warnings component can be added to campaign launch pages to show pre-launch checks.

## Database Schema

### Mailboxes Table Extensions

```sql
ALTER TABLE mailboxes ADD COLUMN:
- send_limit_daily INTEGER DEFAULT 200
- warmup_active BOOLEAN DEFAULT true
- warmup_level INTEGER DEFAULT 1
- reputation_score INTEGER DEFAULT 100 CHECK (reputation_score >= 0 AND reputation_score <= 100)
- bounces_today INTEGER DEFAULT 0
- sends_today INTEGER DEFAULT 0
- last_reset DATE DEFAULT CURRENT_DATE
- paused BOOLEAN DEFAULT false
```

## Testing Checklist

- [ ] Daily reset cron job runs correctly
- [ ] Warmup progression works
- [ ] Bounce protection triggers at 5% threshold
- [ ] Template risk detection works
- [ ] Smart rotation selects least used mailbox
- [ ] UI components display correctly
- [ ] Safety checks prevent sending when limits reached

## Future Enhancements

Potential improvements for v2:
- Reputation score calculation based on engagement
- Domain-level warmup (not just mailbox-level)
- Advanced spam detection with ML
- ISP-specific send limits
- Time-based throttling (hourly limits)
- A/B testing for template risk scores

## Status

✅ **Block 237 — SmartSend Deliverability Shield v1 SHIPPED**

All components implemented and ready for use.










