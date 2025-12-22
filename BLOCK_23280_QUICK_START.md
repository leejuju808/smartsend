# Block 23280 — Quick Start Guide

**SmartSend Quality & Reliability Monitoring v1**

## 🚀 5-Minute Setup

### 1. Deploy Migration
```bash
supabase migration up
```

### 2. Deploy Alert Function
```bash
supabase functions deploy system-alert
```

### 3. Configure Alerts (Supabase Dashboard → Edge Functions → Environment Variables)

```bash
# Email
ALERT_EMAIL_ENABLED=true
OWNER_EMAIL=your@email.com

# Slack (optional)
ALERT_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# SMS (optional)
ALERT_SMS_ENABLED=true
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1234567890
SMS_NUMBER=+1234567890
```

### 4. Update One Edge Function (Example)

**Before:**
```typescript
catch (err) {
  console.error(err);
  return new Response(JSON.stringify({ error: err.message }), { status: 500 });
}
```

**After:**
```typescript
import { logError } from "../_shared/logError.ts";

catch (err) {
  await logError({
    source: "your-function-name",
    severity: "error",
    message: err.message,
    details: { stack: err.stack }
  });
  return new Response(JSON.stringify({ error: err.message }), { status: 500 });
}
```

## 📊 View Dashboard

```bash
GET /api/reliability/dashboard
```

Returns:
- Today's error counts
- Errors by source
- Critical unresolved errors
- Performance metrics
- System health (automation, AI, payments, etc.)

## 🔥 Critical Error Alerts

When you log a critical error:
```typescript
await logError({
  source: "payments",
  severity: "critical", // ← This triggers instant alerts!
  message: "Payment failed",
  details: { job_id: "123" }
});
```

You'll get:
- ✅ Email alert
- ✅ Slack notification (if configured)
- ✅ SMS (if configured)

## 📈 Record Metrics

```typescript
import { recordMetric } from "../_shared/logError.ts";

const startTime = Date.now();
// ... your code ...
const duration = Date.now() - startTime;

await recordMetric("edge_function_duration_ms", duration, {
  function_name: "your-function",
  success: true
});
```

## 🐛 Create Beta Issue

```typescript
const { data } = await supabase.rpc("fn_create_beta_issue", {
  p_category: "critical",
  p_title: "Payment processing failing",
  p_description: "Users reporting payment failures",
  p_source: "payments",
  p_priority: 10
});
```

## 📚 Full Documentation

- **Implementation Guide:** `BLOCK_23280_QUALITY_RELIABILITY_MONITORING_IMPLEMENTATION.md`
- **Error Logging Examples:** `supabase/functions/_shared/ERROR_LOGGING_EXAMPLES.md`
- **Alert Function README:** `supabase/functions/system-alert/README.md`

## ✅ Checklist

- [ ] Migration deployed
- [ ] Alert function deployed
- [ ] Alert channels configured
- [ ] At least one edge function updated with error logging
- [ ] Dashboard endpoint tested
- [ ] Critical error alert tested

---

**That's it!** Your reliability monitoring system is now protecting SmartSend. 🛡️







































