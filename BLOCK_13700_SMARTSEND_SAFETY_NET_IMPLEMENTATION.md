# Block 13700 — SmartSend Safety Net v1 Implementation

**The Hard Bounce, Unsubscribe & Complaint Shield That Protects Roofer Domains From Getting Burned**

## Overview

The SmartSend Safety Net is a comprehensive protection layer that automatically catches and handles:
- Hard bounces
- Soft bounces (auto-suppress after 3)
- Unsubscribe requests
- Spam complaints
- Dangerous leads
- Invalid domains
- Bad data
- High-risk lists

This system prevents roofer domains from getting burned and maintains deliverability.

## What Was Built

### 1. Database Schema (`supabase/migrations/20250130000001_block_13700_smartsend_safety_net_v1.sql`)

#### Core Tables:
- **`bounce_events`** - Tracks all hard and soft bounces
- **`complaint_events`** - Tracks spam complaints
- **`unsubscribe_events`** - Tracks unsubscribe requests
- **`disposable_email_domains`** - Database of known disposable email domains

#### Enhanced Suppression List:
- Added `source_campaign_id` to track which campaign caused suppression
- Added `suppression_type` for more granular tracking
- Added `system_note` for automated notes

### 2. Core Safety Functions

#### `should_send_email(workspace_id, email, campaign_id)`
Comprehensive safety check that validates:
- Email format
- Disposable email domains
- Global suppression list
- Hard bounce history (30 days)
- Complaint history (90 days)
- Unsubscribe history
- Soft bounce count (3+ = suppress)

Returns JSON with `should_send`, `reason`, and `message`.

#### Event Processing Functions:
- **`process_hard_bounce()`** - Processes hard bounce, auto-suppresses contact
- **`process_soft_bounce()`** - Processes soft bounce, suppresses after 3 occurrences
- **`process_complaint()`** - Processes spam complaint, auto-suppresses contact
- **`process_unsubscribe()`** - Processes unsubscribe, auto-suppresses globally

#### Campaign Safety Functions:
- **`check_campaign_safety(campaign_id)`** - Checks campaign metrics and determines safety status
- **`auto_pause_unsafe_campaigns()`** - Automatically pauses campaigns exceeding thresholds
- **`analyze_list_quality(workspace_id, email_list)`** - Analyzes email list quality before sending

### 3. API Endpoints

#### Inbound Event Handlers:
- **`POST /api/inbound/bounce`** - Processes bounce events
- **`POST /api/inbound/complaint`** - Processes spam complaints
- **`POST /api/inbound/unsubscribe`** - Processes unsubscribe requests

#### Safety Worker Tasks:
- **`POST /api/safety/analyze_list`** - Analyzes email list quality
- **`POST /api/safety/pause_campaigns`** - Auto-pauses unsafe campaigns
- **`POST /api/safety/refresh_domain_health`** - Refreshes domain health metrics
- **`POST /api/safety/dedupe_suppression`** - Deduplicates suppression list

### 4. Enhanced SendGuard (`src/lib/sendGuard.ts`)

Updated `shouldSend()` function to use Safety Net's comprehensive checks:
- Now uses `workspace_id` instead of `user_id`
- Calls `should_send_email()` RPC function
- Returns detailed reason and message

Updated `suppressEmail()` function:
- Uses Safety Net's `suppress_contact()` function
- Supports workspace-based suppression

## Safety Rules & Thresholds

### Hard Bounce Shield
- **Action**: Auto-suppress contact immediately
- **Removal**: Remove from all campaigns
- **Marking**: Mark contact as invalid
- **Notification**: Subtle alert to roofer

### Soft Bounce Handling
- **After 1 soft bounce**: Retry in 24 hours
- **After 3 soft bounces**: Auto-suppress, mark low-quality, stop sending

### Unsubscribe Capture
- **Action**: Suppress globally instantly
- **Stops**: All current and future campaigns
- **Logs**: Reason and activity timeline
- **Prevents**: Accidental re-import

### Complaint Shield
- **Action**: Suspend sending to contact instantly
- **Logs**: Safety event
- **Reduces**: Sending volume for 48 hours
- **Triggers**: Safety alerts
- **Signals**: Domain health system

### Campaign Auto-Pause Rules
Campaigns pause automatically when:
- **Bounce rate** ≥ 3% (risky) or ≥ 5% (critical)
- **Complaint rate** ≥ 0.3% (risky) or ≥ 0.5% (critical)
- **Abnormal sending** detected
- **Gmail/Outlook throttling** suspected

### List Quality Protection
If a list has:
- **3%+ bounce rate**
- **Many invalid domains**
- **Spam signals**
- **Old-data signs**

SmartSend:
- Slows the campaign
- Warns the user
- Requires "Confirm Safe to Send"
- Or forces list cleaning

## Integration Points

### With Existing Systems:
1. **Block 12600 (Suppression List)** - Enhanced with additional fields
2. **Block 11600 (Domain Health)** - Integrates with domain health monitoring
3. **Campaign System** - Auto-pause functionality
4. **Email Sending** - Pre-send safety checks

### Webhook Integration:
The inbound endpoints can be called by:
- Email providers (SendGrid, Mailgun, Resend, etc.)
- Existing webhook handlers
- Manual API calls

## Usage Examples

### Check if Email Should Be Sent:
```typescript
import { shouldSend } from '@/lib/sendGuard';

const result = await shouldSend(workspaceId, email, campaignId);
if (!result.ok) {
  console.log(`Cannot send: ${result.reason} - ${result.message}`);
}
```

### Process Hard Bounce:
```typescript
// Via API endpoint
POST /api/inbound/bounce
{
  "workspace_id": "...",
  "email": "user@example.com",
  "bounce_type": "hard",
  "bounce_reason": "mailbox_not_found",
  "campaign_id": "..."
}
```

### Analyze List Quality:
```typescript
POST /api/safety/analyze_list
{
  "workspace_id": "...",
  "email_list": ["email1@example.com", "email2@example.com"]
}

// Returns:
{
  "ok": true,
  "analysis": {
    "total": 100,
    "valid": 85,
    "invalid_format": 5,
    "disposable": 3,
    "suppressed": 2,
    "hard_bounce_history": 3,
    "complaint_history": 1,
    "unsubscribed": 1,
    "bounce_rate_estimate": 0.08,
    "quality_score": 85,
    "recommendation": "caution",
    "should_block": false
  }
}
```

## Next Steps (UI Components - Pending)

The following UI components should be built:

1. **Dashboard Warning Bar**
   - Shows count of safety issues
   - Click to view details
   - Example: "⚠️ SmartSend Safety Net: 4 issues detected (Click to Fix)"

2. **Campaign Safety Widget**
   - Color-coded badge: 🟢 Safe, 🟡 Caution, 🔴 Risk
   - Shows next to campaign name

3. **Lead Profile Safety Flags**
   - Shows safety status under contact info
   - Flags: Hard Bounce, Unsubscribed, Complaint, Low-Quality Source

4. **Sending Health Meter**
   - Integrates with Block 11600
   - Shows: "Domain Health: 92% (Healthy)"
   - Color meter: 100% → perfect, 70% → caution, 50% → risky, <30% → critical

## Cron Job Setup

Add to `vercel.json` or Supabase cron:

```json
{
  "path": "/api/safety/pause_campaigns",
  "schedule": "*/15 * * * *"  // Every 15 minutes
}
```

```json
{
  "path": "/api/safety/dedupe_suppression",
  "schedule": "0 3 * * *"  // Daily at 3 AM
}
```

## Testing Checklist

- [ ] Hard bounce auto-suppresses contact
- [ ] Soft bounce suppresses after 3 occurrences
- [ ] Unsubscribe suppresses globally
- [ ] Complaint suppresses contact
- [ ] Disposable emails are blocked
- [ ] Campaign auto-pauses when threshold exceeded
- [ ] List quality analysis works correctly
- [ ] Suppression deduplication works
- [ ] Domain health refresh integrates properly

## Why Roofers Will Love This

🔨 **1. Their domain will NEVER burn**
- SmartSend handles all risks automatically

🔨 **2. They feel SAFE using automation**
- Safety net builds confidence in the product

🔨 **3. Less angry homeowners**
- Unsubscribes & complaints caught instantly

🔨 **4. Cleaner lists = better inboxing**
- Especially for cheap lists

🔨 **5. This feature is a MASSIVE selling point**
- "SmartSend protects your domain. Others don't."

This is how SmartSend becomes elite.





















































