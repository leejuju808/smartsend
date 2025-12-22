# Block 17700 — SmartSend Real-Time Alerts v1 — Integration Guide

This guide shows how to integrate alert triggers into existing systems.

## Quick Start

```typescript
import { alertNewReply, alertAppointment, alertBillingIssue } from "@/src/lib/alerts";

// Trigger alert when reply detected
await alertNewReply({
  workspace_id: workspaceId,
  contact_id: contactId,
  message_id: messageId,
  reply_text: replyText,
  intent: "hot_lead",
});

// Trigger alert when appointment booked
await alertAppointment({
  workspace_id: workspaceId,
  appointment_id: appointmentId,
  event_type: "booked",
  homeowner_name: "Sarah M.",
  appointment_time: "Tomorrow 10:20 AM",
});
```

## Integration Points

### 1. Reply Detection System

**File:** `supabase/functions/handle-new-reply-intent/index.ts`

Add after detecting hot/warm lead:

```typescript
import { alertNewReply } from "@/src/lib/alerts";

// After intent classification
if (label === "hot_lead" || label === "warm_lead") {
  await alertNewReply({
    workspace_id: workspaceId,
    contact_id: contactId,
    message_id: messageId,
    reply_text: replyText,
    intent: label,
    campaign_id: campaignId,
  });
}
```

### 2. Appointment Booking System

**File:** `src/app/api/scheduler/book/route.ts`

Add after successful booking:

```typescript
import { alertAppointment } from "@/src/lib/alerts";

// After creating booking
await alertAppointment({
  workspace_id: workspace_id,
  appointment_id: booking.id,
  event_type: "booked",
  contact_id: contactId,
  appointment_time: start_time,
  homeowner_name: homeowner_name,
});
```

### 3. Appointment Reminders

**File:** Create new cron job or add to existing scheduler

```typescript
import { alertAppointment } from "@/src/lib/alerts";

// Check for appointments starting in 1 hour
const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
const { data: upcomingAppointments } = await supabase
  .from("schedule_bookings")
  .select("*")
  .eq("status", "booked")
  .gte("start_time", new Date().toISOString())
  .lte("start_time", oneHourFromNow.toISOString());

for (const appointment of upcomingAppointments) {
  await alertAppointment({
    workspace_id: appointment.workspace_id,
    appointment_id: appointment.id,
    event_type: "reminder",
    contact_id: appointment.contact_id,
    appointment_time: appointment.start_time,
    homeowner_name: appointment.homeowner_name,
  });
}
```

### 4. Insurance Detection

**File:** `supabase/functions/insurance-detect/index.ts` or reply handler

```typescript
import { alertInsuranceClaim } from "@/src/lib/alerts";

// After detecting insurance language
if (hasInsuranceLanguage) {
  await alertInsuranceClaim({
    workspace_id: workspaceId,
    contact_id: contactId,
    insurance_type: "claim", // or "adjuster", "deductible"
    details: detectedText,
    metadata: { confidence: 0.95 },
  });
}
```

### 5. Storm Damage Detection

**File:** Reply handler or weather monitoring system

```typescript
import { alertStormDamage } from "@/src/lib/alerts";

// After detecting storm keywords
const stormKeywords = ["hail", "wind", "leak", "water damage", "missing shingles"];
if (stormKeywords.some(keyword => replyText.toLowerCase().includes(keyword))) {
  await alertStormDamage({
    workspace_id: workspaceId,
    contact_id: contactId,
    storm_type: "hail", // or "wind", "leak", etc.
    location: contact.city + ", " + contact.state,
    severity: "high",
  });
}
```

### 6. Billing System

**File:** `src/app/api/billing/webhook/route.ts` or payment handler

```typescript
import { alertBillingIssue } from "@/src/lib/alerts";

// Payment failed
if (paymentStatus === "failed") {
  await alertBillingIssue({
    workspace_id: workspaceId,
    issue_type: "payment_failed",
    details: "Your payment method failed. Update your card to continue.",
  });
}

// Over limit
if (emailsSent >= planLimit) {
  await alertBillingIssue({
    workspace_id: workspaceId,
    issue_type: "over_limit",
    details: `You've reached your sending limit of ${planLimit} emails.`,
  });
}

// Domain health low
if (domainHealth < 0.7) {
  await alertBillingIssue({
    workspace_id: workspaceId,
    issue_type: "domain_health_low",
    details: "Domain reputation is low. Sending slowed to protect deliverability.",
  });
}
```

### 7. Performance Monitoring

**File:** Analytics or campaign monitoring system

```typescript
import { alertPerformance } from "@/src/lib/alerts";

// High engagement detected
if (opensInLastHour > 20) {
  await alertPerformance({
    workspace_id: workspaceId,
    metric_type: "high_opens",
    value: opensInLastHour,
    campaign_id: campaignId,
    details: `${opensInLastHour} homeowners opened your email in the last hour`,
  });
}

// High-value lead detected
if (estimatedJobValue > 15000) {
  await alertPerformance({
    workspace_id: workspaceId,
    metric_type: "high_value_lead",
    value: estimatedJobValue,
    contact_id: contactId,
    details: `New lead with estimated value of $${estimatedJobValue.toLocaleString()}`,
  });
}
```

## Database Triggers (Optional)

You can also use database triggers to automatically create alerts:

```sql
-- Example: Trigger alert when appointment is booked
CREATE OR REPLACE FUNCTION trigger_appointment_alert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.create_alert(
    NEW.workspace_id,
    NULL, -- workspace-wide
    'appointment',
    '📅 New Appointment Booked',
    NEW.homeowner_name || ' — ' || NEW.start_time::text,
    NEW.contact_id,
    NULL,
    NEW.id,
    '{}'::jsonb,
    'appointment_trigger'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_alert
AFTER INSERT ON schedule_bookings
FOR EACH ROW
EXECUTE FUNCTION trigger_appointment_alert();
```

## Testing

Test alerts locally:

```typescript
// In your test file or API route
import { createAlert } from "@/src/lib/alerts";

await createAlert({
  workspace_id: "your-workspace-id",
  type: "hot_lead",
  title: "🔥 Test Hot Lead",
  message: "This is a test alert",
  contact_id: "contact-id",
  source: "test",
});
```

Then check `/alerts` page to see the alert appear.

## Next Steps

1. Integrate alert triggers into reply detection system
2. Add appointment reminder alerts (1 hour before)
3. Integrate billing alerts into payment webhooks
4. Add performance alerts to analytics dashboard
5. Set up daily digest cron job (already created, just needs scheduling)





















































