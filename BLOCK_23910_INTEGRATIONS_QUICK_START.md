# Block 23910 — Roofing Integrations Quick Start Guide

## 🚀 Quick Setup

### 1. Run Migration

```bash
# Apply the migration
supabase migration up
# Or if using psql directly:
psql -h your-db-host -U postgres -d your-db-name -f supabase/migrations/20250130000001_block23910_roofing_integrations_v1.sql
```

### 2. Create Your First Integration

#### Web Form Integration (Gravity Forms Example)

```bash
curl -X POST https://yourdomain.com/api/integrations/roofing/manage \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "workspace_id": "your-workspace-id",
    "type": "webform_gravity",
    "config": {
      "form_id": "123",
      "webhook_url": "https://yourdomain.com/api/integrations/roofing/webforms/webhook"
    },
    "phase": 1,
    "enabled": true
  }'
```

#### SMS Integration (Twilio Example)

```bash
curl -X POST https://yourdomain.com/api/integrations/roofing/manage \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "workspace_id": "your-workspace-id",
    "type": "sms_twilio",
    "config": {
      "account_sid": "your-twilio-account-sid",
      "auth_token": "your-twilio-auth-token",
      "phone_number": "+15551234567",
      "webhook_url": "https://yourdomain.com/api/integrations/roofing/sms/webhook"
    },
    "phase": 2,
    "enabled": true
  }'
```

### 3. Configure Webhooks

#### Gravity Forms Webhook Setup
1. Go to Gravity Forms → Forms → Your Form → Settings → Webhooks
2. Add new webhook
3. URL: `https://yourdomain.com/api/integrations/roofing/webforms/webhook`
4. Method: POST
5. Add custom headers:
   - `X-Integration-ID`: Your integration ID
   - `X-Workspace-ID`: Your workspace ID

#### Twilio Webhook Setup
1. Go to Twilio Console → Phone Numbers → Your Number
2. Set webhook URL: `https://yourdomain.com/api/integrations/roofing/sms/webhook`
3. HTTP method: POST
4. Add custom headers in your webhook handler or use query params

### 4. Test Integration

#### Test Web Form Submission

```bash
curl -X POST https://yourdomain.com/api/integrations/roofing/webforms/webhook \
  -H "Content-Type: application/json" \
  -H "X-Integration-ID: your-integration-id" \
  -H "X-Workspace-ID: your-workspace-id" \
  -d '{
    "form_data": {
      "email": "test@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "555-1234",
      "message": "I need a roof estimate ASAP"
    }
  }'
```

#### Test SMS Message

```bash
curl -X POST https://yourdomain.com/api/integrations/roofing/sms/webhook \
  -H "Content-Type: application/json" \
  -H "X-Integration-ID: your-integration-id" \
  -H "X-Workspace-ID: your-workspace-id" \
  -d '{
    "provider": "twilio",
    "From": "+15551234567",
    "To": "+15559876543",
    "Body": "Yes, I need someone to come out this week!"
  }'
```

## 📋 Integration Types Reference

### Communication (Category 1)
- `gmail` - Gmail integration (already exists)
- `outlook` - Outlook integration (already exists)
- `sms_twilio` - Twilio SMS
- `sms_telnyx` - Telnyx SMS
- `webform_gravity` - Gravity Forms
- `webform_jotform` - Jotform
- `webform_wix` - Wix Forms
- `webform_gohighlevel` - GoHighLevel Forms

### CRM (Category 2)
- `crm_jobnimbus` - JobNimbus CRM
- `crm_acculynx` - AccuLynx CRM
- `crm_roofr` - Roofr Estimates
- `crm_gohighlevel` - GoHighLevel CRM

### Calendar (Category 3)
- `calendar_google` - Google Calendar
- `calendar_outlook` - Outlook Calendar
- `booking_calendly` - Calendly
- `booking_savvycal` - SavvyCal
- `booking_youcanbookme` - YouCanBookMe

### Import (Category 4)
- `import_csv` - CSV/Excel import
- `import_quickbooks` - QuickBooks export
- `import_phone_contacts` - Phone contacts

### Weather (Category 5)
- `weather_noaa` - NOAA Weather API
- `weather_hailtrace` - HailTrace (future)
- `weather_hail_recon` - Hail Recon (future)

## 🔍 Monitoring Integration Status

### Check Integration Status

```bash
curl -X GET "https://yourdomain.com/api/integrations/roofing/manage?workspace_id=your-workspace-id" \
  -H "Cookie: your-auth-cookie"
```

### Check Integration Leads

```sql
SELECT 
  il.*,
  l.email,
  l.first_name,
  l.last_name,
  l.status,
  i.type as integration_type
FROM integration_leads il
JOIN leads l ON l.id = il.lead_id
JOIN integrations i ON i.id = il.integration_id
WHERE il.workspace_id = 'your-workspace-id'
ORDER BY il.created_at DESC
LIMIT 50;
```

### Check Webform Submissions

```sql
SELECT 
  ws.*,
  l.email,
  l.status
FROM webform_submissions ws
LEFT JOIN leads l ON l.id = ws.lead_id
WHERE ws.workspace_id = 'your-workspace-id'
ORDER BY ws.created_at DESC;
```

## 🎯 What Happens When a Lead Comes In

1. **Lead arrives** via webhook (webform, SMS, CRM, etc.)
2. **Stored** in integration-specific table (webform_submissions, sms_messages, etc.)
3. **Processed** through `/api/integrations/roofing/process-lead`
4. **Lead created** (or existing lead updated)
5. **AI classification** runs automatically (HOT/WARM/NOT)
6. **Campaign assignment** happens if HOT/WARM
7. **Timeline event** created
8. **Roofer notified** (if configured)

## 🐛 Troubleshooting

### Integration not processing leads

1. Check integration is enabled:
   ```sql
   SELECT id, type, enabled, sync_status, error_message 
   FROM integrations 
   WHERE id = 'your-integration-id';
   ```

2. Check webhook is receiving data:
   - Check webhook logs
   - Verify webhook URL is correct
   - Check authentication headers

3. Check integration_leads table:
   ```sql
   SELECT * FROM integration_leads 
   WHERE integration_id = 'your-integration-id' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

### AI classification not working

1. Verify message_text is provided in webhook payload
2. Check AI service is configured and accessible
3. Review classification results:
   ```sql
   SELECT ai_classification, ai_confidence, ai_reasoning 
   FROM integration_leads 
   WHERE integration_id = 'your-integration-id';
   ```

### Campaign not assigning

1. Verify workspace has active campaigns:
   ```sql
   SELECT id, name, status 
   FROM campaigns 
   WHERE workspace_id = 'your-workspace-id' 
   AND status = 'active';
   ```

2. Check lead classification (only HOT/WARM get assigned):
   ```sql
   SELECT ai_classification, campaign_assigned 
   FROM integration_leads 
   WHERE lead_id = 'your-lead-id';
   ```

## 📚 Additional Resources

- Full implementation docs: `BLOCK_23910_ROOFING_INTEGRATIONS_V1_IMPLEMENTATION.md`
- Migration file: `supabase/migrations/20250130000001_block23910_roofing_integrations_v1.sql`
- API routes: `src/app/api/integrations/roofing/`

---

**Need help?** Check the full implementation documentation or review the API route source code.






































