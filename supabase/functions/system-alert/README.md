# System Alert Edge Function

**Block 23280 — SmartSend Quality & Reliability Monitoring v1**

This edge function sends alerts when critical errors occur in SmartSend. It's automatically triggered via database trigger when a critical error is logged to the `system_errors` table.

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy system-alert
```

### 2. Configure Environment Variables

Set these in Supabase Dashboard → Project Settings → Edge Functions:

#### Email Alerts
```bash
ALERT_EMAIL_ENABLED=true
OWNER_EMAIL=founder@smartsend.ai
EMAIL_API_URL=https://your-email-api.com/send  # Optional: if you have an email API
```

#### Slack Alerts
```bash
ALERT_SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### SMS Alerts (via Twilio)
```bash
ALERT_SMS_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
SMS_NUMBER=+1234567890  # Your phone number
```

### 3. Configure Database Settings (Optional)

If you want the database trigger to call this function directly, set:

```sql
ALTER DATABASE postgres SET app.alert_function_url = 'https://YOUR_PROJECT.supabase.co/functions/v1/system-alert';
ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

## How It Works

1. **Critical Error Occurs** → Logged to `system_errors` table with `severity = 'critical'`
2. **Database Trigger Fires** → `fn_trigger_critical_alert()` function executes
3. **Alert Function Called** → HTTP POST to `/functions/v1/system-alert`
4. **Alerts Sent** → Email, Slack, and/or SMS notifications sent based on configuration

## Manual Usage

You can also call this function manually:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/system-alert \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "error_id": "uuid-of-error",
    "source": "payments",
    "message": "Payment processing failed",
    "created_at": "2025-01-31T12:00:00Z",
    "details": {
      "job_id": "123",
      "stripe_error": "Card declined"
    }
  }'
```

## Alert Format

### Email Alert
```
Subject: 🚨 SmartSend Critical Error: payments

Critical Error Detected

Source: payments
Error ID: abc-123-def
Message: Payment processing failed
Time: 2025-01-31T12:00:00Z

Details:
{
  "job_id": "123",
  "stripe_error": "Card declined"
}

View in dashboard: https://app.smartsend.ai/dashboard/reliability
```

### Slack Alert
Sends a formatted Slack message with:
- Header: "🚨 Critical Error Detected"
- Fields: Source, Error ID, Message, Time
- Details block with full error context

### SMS Alert
```
🚨 SmartSend Critical Error: payments - Payment processing failed
```

## Testing

Test the alert function:

```typescript
// In an edge function or API route
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/system-alert`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      error_id: "test-error-id",
      source: "test",
      message: "This is a test alert",
      created_at: new Date().toISOString(),
      details: { test: true },
    }),
  }
);
```

## Troubleshooting

### Alerts Not Sending

1. **Check Environment Variables** - Ensure all required variables are set
2. **Check Function Logs** - View logs in Supabase Dashboard → Edge Functions → system-alert → Logs
3. **Check Database Trigger** - Verify trigger is firing:
   ```sql
   SELECT * FROM system_errors WHERE severity = 'critical' ORDER BY created_at DESC LIMIT 5;
   ```

### Email Not Working

- Ensure `EMAIL_API_URL` is configured if using custom email API
- Check email API logs
- Fallback: Email alerts will be logged to `system_logs` if email API is unavailable

### Slack Not Working

- Verify webhook URL is correct
- Test webhook URL manually:
  ```bash
  curl -X POST YOUR_SLACK_WEBHOOK_URL \
    -H "Content-Type: application/json" \
    -d '{"text":"Test message"}'
  ```

### SMS Not Working

- Verify Twilio credentials are correct
- Check Twilio account balance
- Verify phone numbers are in E.164 format (+1234567890)

## Security

- Function requires `service_role` key for authentication
- Only critical errors trigger alerts (not warnings or info)
- Alert payloads are logged to `system_logs` for audit trail







































