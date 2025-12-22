# Block 11600 — SmartSend Sending Health Monitor v1

## Overview

The Deliverability Guardian that keeps roofers out of spam forever. This system automatically monitors and protects email domains from getting burned, blacklisted, or landing in spam.

## Features

### 1. The 5 Roofing Deliverability Danger Zones

SmartSend monitors:

1. **Bounce Rate** - If > 5% in a rolling 24-hour window → Auto-Pause Sends
2. **Complaint Rate** - If > 0.5% (industry critical level) → Pause + Mandatory Review
3. **Too Many Emails at Once** - If roofer tries to send 200+ emails instantly from a cold domain → SmartSend slows the send speed automatically
4. **No SPF / DKIM Setup** - If DNS is not configured → Warning banner + "Sending Safe Mode" enabled (slow rate limit)
5. **Too Many Follow-Ups Sent Too Fast** - SmartSend spaces follow-ups randomly (6–18 seconds apart) to avoid pattern detection

### 2. Health Score (0–100 Meter)

Displayed on Dashboard:
- **Sending Health: 92/100 (Healthy)**

Color-Coded:
- **90–100** = Green (Healthy)
- **70–89** = Yellow (Warning)
- **0–69** = Red (Critical)

**Score Calculation:**
- 40% bounce rate
- 30% complaint rate
- 20% sending volume
- 10% domain age

Roofers never see this math — only the score.

### 3. Safety Rules SmartSend Enforces Automatically

#### 🛡 Safety Rule #1 — Auto-Pause on High Bounce Rate
- Bounce > 5% → SmartSend shuts off sending for 24 hours
- Roofer sees: "Sending paused due to high bounce rate. This protects your domain."

#### 🛡 Safety Rule #2 — Daily Volume Cap
- New domain (<14 days): Max 40 emails per day
- Warm domain: Max 150–250 depending on reputation score

#### 🛡 Safety Rule #3 — Auto-Warmup Mode (for new domains)
If domain < 14 days old:
- Day 1: 10 emails
- Day 2: 15 emails
- Day 3: 20 emails
- Day 4: 30 emails
- Day 5: 40 emails
- Continues ramp-up

Roofer doesn't do anything — SmartSend does it all.

#### 🛡 Safety Rule #4 — Cooldown After Complaint
1 complaint triggers:
- Stop sending for 48 hours
- Automatic review message
- Recommendation to remove risky contacts
- Prompt to verify domain setup

#### 🛡 Safety Rule #5 — Randomized Sending Windows
To avoid spam detection:
- Random send times
- Variable delays
- Spread-out sending
- No batch blasts

## Technical Implementation

### Database Schema

**Table: `sending_health`**

Fields:
- `user_id` (uuid, primary key)
- `bounce_24h` (numeric) - bounce rate in last 24h (%)
- `complaint_24h` (numeric) - complaint rate in last 24h (%)
- `volume_24h` (int) - emails sent in last 24h
- `domain_age_days` (int) - age of primary sending domain
- `health_score` (int) - 0-100 health score
- `safe_mode` (boolean) - safe mode enabled (slow rate limit)
- `paused_until` (timestamptz) - paused until this time (null if not paused)
- `pause_reason` (text) - reason for pause
- `last_updated` (timestamptz)
- `created_at` (timestamptz)

### Database Functions

1. **`calculate_sending_health_score(p_user_id uuid)`**
   - Calculates 0-100 health score based on bounce rate (40%), complaint rate (30%), volume (20%), and domain age (10%)

2. **`update_sending_health_metrics(p_user_id uuid)`**
   - Updates sending health metrics for a user (bounce rate, complaint rate, volume, domain age)

3. **`enforce_bounce_rate_safety(p_user_id uuid)`**
   - Auto-pauses sending if bounce rate > 5% for 24 hours

4. **`enforce_complaint_rate_safety(p_user_id uuid)`**
   - Auto-pauses sending if complaint rate > 0.5% for 48 hours

5. **`enforce_safe_mode(p_user_id uuid)`**
   - Enables safe mode for new domains (<14 days) or missing DNS (SPF/DKIM)

6. **`get_daily_send_allowance(p_user_id uuid)`**
   - Returns daily send allowance based on domain age, health score, and safe mode status

### Edge Functions

#### `/deliverability/check`
- **Schedule:** Runs hourly (every hour)
- **Purpose:** Computes health scores for all users
- **Actions:**
  - Gets all users who have sent emails
  - Updates sending health metrics for each user
  - Calculates bounce rate, complaint rate, volume, and domain age

#### `/deliverability/actions`
- **Schedule:** Runs hourly (every hour, after check)
- **Purpose:** Executes safety rules
- **Actions:**
  - Enforces bounce rate safety (auto-pause if >5%)
  - Enforces complaint rate safety (auto-pause if >0.5%)
  - Enforces safe mode (for new domains or missing DNS)

### Cron Configuration

Added to `supabase/config.toml`:

```toml
# Block 11600 - SmartSend Sending Health Monitor v1
[functions."deliverability-check"]
verify_jwt = false

[cron.jobs."deliverability-check"]
schedule = "0 * * * *"   # every hour - compute health scores
endpoint = "/functions/v1/deliverability-check"

[functions."deliverability-actions"]
verify_jwt = false

[cron.jobs."deliverability-actions"]
schedule = "0 * * * *"   # every hour - execute safety rules (after check)
endpoint = "/functions/v1/deliverability-actions"
```

## Usage

### Query Health Score

```sql
SELECT 
  user_id,
  health_score,
  bounce_24h,
  complaint_24h,
  volume_24h,
  safe_mode,
  paused_until,
  pause_reason
FROM public.sending_health
WHERE user_id = '...';
```

### Check Daily Send Allowance

```sql
SELECT public.get_daily_send_allowance('user-uuid');
```

### Manual Health Update

```sql
SELECT public.update_sending_health_metrics('user-uuid');
```

## UI Integration Points

### Dashboard Banner
Display health status:
- "Sending paused due to elevated bounce rate. Fix now."
- "Sending paused due to high complaint rate. Review required."

### Email Setup Page
Display warning:
- "SPF/DKIM not detected — sending in Safe Mode."

### Activity Log
Show actions:
- "SmartSend slowed sending to protect your domain."
- "Sending paused due to high bounce rate. This protects your domain."

## Why Roofers Will Love This Feature

1. **Protects their domain reputation** - Roofers don't understand deliverability — SmartSend quietly guards them
2. **Prevents major disasters** - A burned domain = no email for months. SmartSend prevents that automatically
3. **Makes SmartSend feel professional and safe** - Roofers want a tool that "won't get them in trouble"
4. **Keeps reply rates high** - Healthy domain = more inbox delivery = more homeowner replies = more jobs
5. **Reduces cancellations** - Roofers don't quit tools that keep their email safe and productive

## Files Created

1. **Migration:** `supabase/migrations/20250130000002_block_11600_sending_health_monitor_v1.sql`
2. **Edge Function:** `supabase/functions/deliverability-check/index.ts`
3. **Edge Function:** `supabase/functions/deliverability-actions/index.ts`
4. **Config:** Updated `supabase/config.toml` with cron jobs

## Next Steps

1. Deploy migration to database
2. Deploy edge functions:
   ```bash
   supabase functions deploy deliverability-check
   supabase functions deploy deliverability-actions
   ```
3. Add UI components to display health score and alerts
4. Integrate `get_daily_send_allowance()` into send queue logic
5. Add warmup schedule logic for new domains























































