# SmartSend — Warm-Up & Sending Guardrails

Protect reputation while scaling sends. This pack adds **daily warm‑up ramps**, **per‑domain & global caps**, and **automatic cooldowns** when bounce/complaint rates spike.

## 🚀 Features

- **Daily Warm-Up Ramps**: Start with 25 emails/day, increase by 25/week
- **Per-Domain Caps**: Limit sends per domain (default: 200/day)
- **Global Workspace Caps**: Overall daily limits (default: 1000/day)
- **Automatic Cooldowns**: Pause sending when bounce rates exceed 5%
- **Atomic Reservations**: Race-condition safe send counting
- **Full Audit Trail**: Track every send attempt and decision

## 📋 Prerequisites

- Existing SmartSend setup with Supabase
- `delivery_events` or `bounces` table for reputation tracking
- `app.set_workspace()` function for RLS scoping

## 🗄️ Database Setup

Run the SQL migration in your Supabase SQL editor:

```sql
-- Run: supabase/migrations/20250140000000_sending_guardrails.sql
```

This creates:
- `send_policies` - Workspace-level sending rules
- `send_counters` - Daily domain counters with cooldowns
- `sending_audit` - Complete send attempt history
- Helper functions for caps, bounce rates, and reservations

## 🔧 Implementation

### 1. Server Utilities

**`/lib/sending/guard.ts`**

```typescript
import { preflightGuard, reserveAndSend } from '@/lib/sending/guard';

// Check if send is allowed (without reserving)
const result = await preflightGuard(workspaceId, email);

// Guard and send atomically
const result = await reserveAndSend(workspaceId, email, async ({ toEmail }) => {
  await sendEmail({ toEmail, subject, html, text });
});
```

### 2. API Endpoint

**`/api/sending/guarded-send`**

```bash
POST /api/sending/guarded-send
{
  "workspaceId": "uuid",
  "toEmail": "user@domain.com",
  "subject": "Hello",
  "html": "<p>Content</p>",
  "text": "Content"
}
```

### 3. Dashboard UI

**`/dashboard/sending`**

- View current policy settings
- Monitor daily send counts
- Track cooldown status
- Review audit logs

## 📊 How It Works

### Warm-Up Schedule

```
Week 1: 25 emails/day
Week 2: 50 emails/day  
Week 3: 75 emails/day
Week 4: 100 emails/day
...up to max (500/day)
```

### Bounce Rate Protection

1. **Monitor**: Track bounce/complaint rates over 7-day window
2. **Threshold**: Default 5% bounce rate triggers cooldown
3. **Cooldown**: Pause sending for 24 hours (configurable)
4. **Resume**: Automatically resume when window expires

### Send Flow

1. **Preflight Check**: Validate domain, check cooldowns, bounce rates
2. **Reservation**: Atomically increment daily counter
3. **Send**: Execute email delivery
4. **Audit**: Log success/failure with reason

## 🎯 Usage Examples

### Campaign Sending

```typescript
// In your campaign worker
import { reserveAndSend } from '@/lib/sending/guard';

for (const recipient of campaign.recipients) {
  const result = await reserveAndSend(
    workspaceId, 
    recipient.email,
    async ({ toEmail }) => {
      await sendCampaignEmail(campaign, toEmail);
    }
  );
  
  if (!result.allowed) {
    console.log(`Blocked: ${recipient.email} - ${result.reason}`);
  }
}
```

### Sequence Emails

```typescript
// In your sequence automation
const result = await reserveAndSend(workspaceId, contact.email, async ({ toEmail }) => {
  await sendSequenceEmail(sequence, toEmail, step);
});

if (result.allowed) {
  await markStepComplete(contact.id, step.id);
} else {
  await scheduleRetry(contact.id, step.id, result.reason);
}
```

### Manual Sends

```typescript
// For one-off emails
const result = await preflightGuard(workspaceId, email);
if (result.allowed) {
  // Show user their caps
  console.log(`Today: ${result.caps?.todayCap}, Domain: ${result.caps?.domainCap}`);
  
  // Proceed with send
  await sendEmail({ toEmail: email, ...emailData });
} else {
  // Show user why blocked
  console.log(`Blocked: ${result.reason}`);
}
```

## 🔍 Monitoring & Debugging

### Check Current Status

```typescript
// Get today's counters
const { data: counters } = await supabase
  .from('send_counters')
  .select('*')
  .eq('workspace_id', workspaceId)
  .eq('day', new Date().toISOString().slice(0, 10));

// Check policy
const { data: policy } = await supabase
  .from('send_policies')
  .select('*')
  .eq('workspace_id', workspaceId)
  .single();
```

### View Audit Logs

```typescript
// Recent activity
const { data: audit } = await supabase
  .from('sending_audit')
  .select('*')
  .eq('workspace_id', workspaceId)
  .order('created_at', { ascending: false })
  .limit(100);
```

### Test Script

Run the test script to verify setup:

```bash
npx tsx scripts/test-sending-guardrails.ts
```

## ⚙️ Configuration

### Policy Settings

```sql
-- Update workspace policy
UPDATE send_policies 
SET 
  ramp_start_per_day = 50,
  weekly_increment = 50,
  domain_max_per_day = 300,
  bounce_rate_threshold = 0.03  -- 3%
WHERE workspace_id = 'your-workspace-id';
```

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEMO_WORKSPACE_ID=

# Email provider (one of)
RESEND_API_KEY=
SENDGRID_API_KEY=
POSTMARK_SERVER_TOKEN=
```

## 🚨 Troubleshooting

### Common Issues

1. **"No policy found"**: Run the migration SQL
2. **"RLS policy denied"**: Check `app.set_workspace()` call
3. **"Function not found"**: Verify SQL functions were created
4. **"Bounce rate always 0"**: Check `bounces` table has data

### Debug Steps

1. Check Supabase logs for SQL errors
2. Verify table permissions and RLS policies
3. Test `app.set_workspace()` function
4. Check audit logs for blocked sends

### Performance

- **Indexes**: Already created on `send_counters(workspace_id, day)`
- **Functions**: `app.allowed_cap()` is immutable for caching
- **Counters**: Atomic updates prevent race conditions

## 🔮 Future Enhancements

- **UI Policy Editor**: Visual warm-up curve builder
- **Advanced Scheduling**: Time-based send windows
- **Domain Reputation**: Per-domain warm-up curves
- **Smart Cooldowns**: ML-based bounce rate predictions
- **Integration Hooks**: Webhook notifications for limits

## 📚 Related

- [SmartSend Core Engine](../SMARTSEND_CORE_ENGINE_README.md)
- [Email Reputation System](../supabase/migrations/20250120000000_email_reputation_system.sql)
- [Campaign System](../docs/CAMPAIGNS_SYSTEM.md)

---

**Ready to protect your sender reputation?** 🛡️

Run the migration, test the guardrails, and scale your sends safely! 