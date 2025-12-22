# SmartSend Advanced Metrics + Hourly Caps + Bounce Webhooks

This document outlines the implementation of SmartSend's advanced features for enterprise-grade email deliverability and analytics.

## 🚀 Features Implemented

### 1. **Per-Step Campaign Metrics**
- Unique opens/clicks per step with step_index tracking
- Aggregated campaign performance data
- Step-by-step engagement analysis

### 2. **Hourly Domain Caps + Warmup**
- Per-domain hourly sending limits
- Mailbox warmup schedules (gradual volume increase)
- Automatic rescheduling when caps exceeded

### 3. **Bounce Webhook Integration**
- Unified endpoint for SES, Mailgun, and MailerSend
- Automatic contact suppression
- Future send queue purging
- Comprehensive bounce event logging

## 📋 Prerequisites

Before implementing these features, ensure you have:

- ✅ Core SmartSend engine running
- ✅ Supabase database with existing campaigns/sequences tables
- ✅ Basic tracking system in place
- ✅ Email provider integration (SES, Mailgun, or MailerSend)

## 🗄️ Database Setup

### Step 1: Run the Migration

Execute the SQL migration in your Supabase SQL editor:

```sql
-- Run the entire migration file:
-- supabase/migrations/20250120_smartsend_advanced_metrics.sql
```

This creates:
- `mailboxes` table for warmup and caps
- `domain_hourly_counters` for hourly limits
- `campaign_step_metrics` for per-step analytics
- `bounce_events` for bounce tracking
- `suppressed_contacts` for bounced/complained emails

### Step 2: Verify RLS Policies

Ensure Row Level Security is enabled and policies are created for:
- `mailboxes` - User can manage own mailboxes
- `domain_hourly_counters` - Service role access for cron jobs
- `campaign_step_metrics` - User can view own campaign metrics
- `bounce_events` - Webhook access + user ownership
- `suppressed_contacts` - Webhook access + user ownership

## 🔧 Library Updates

### 1. **Deliverability Library** (`src/lib/deliverability.ts`)

New functions for managing hourly caps and warmup:

```typescript
// Check if domain is under hourly cap
const canSend = await canSendFromDomain(domain, userId, mailboxId);

// Get warmup-adjusted daily cap
const warmupCap = await getWarmupCap(mailboxId);

// Increment hourly counter
await incrementHourlyCounter(domain, userId, hourStart);
```

### 2. **Tracking Library** (`src/lib/tracking.ts`)

Updated to include step_index:

```typescript
// Create tracking tokens with step information
const { openToken, clickTokens } = await createTrackingTokens(
  campaignId, 
  recipientId, 
  stepIndex, // New parameter
  urls
);

// Increment step metrics
await incrementStepMetrics(campaignId, stepIndex, 'open');
```

## 🌐 API Endpoints

### 1. **Updated Tracking Endpoints**

#### Open Tracking (`/api/t/o/[token]`)
- Records opens with step_index
- Increments campaign step metrics
- Returns 1x1 tracking pixel

#### Click Tracking (`/api/t/c/[token]`)
- Records clicks with step_index
- Increments campaign step metrics
- Redirects to original URL

### 2. **Bounce Webhook** (`/api/webhooks/bounce`)

Unified endpoint for all email providers:

```bash
# Configure your provider to POST to:
https://yourdomain.com/api/webhooks/bounce
```

**Supported Providers:**
- **Amazon SES**: JSON notifications
- **Mailgun**: JSON or form data
- **MailerSend**: JSON webhooks

**What it does:**
- Records bounce events
- Suppresses bounced contacts
- Purges future queued sends
- Logs all activity

### 3. **Cron Sender** (`/api/cron/send`)

Enhanced sender with caps enforcement:

```bash
# Set environment variable
CRON_SECRET=your-secret-here

# Call with authorization header
curl -H "Authorization: Bearer your-secret-here" \
     https://yourdomain.com/api/cron/send
```

**Features:**
- Hourly cap enforcement
- Warmup schedule respect
- Automatic rescheduling
- Per-step tracking integration

## 🎨 UI Components

### 1. **Campaign Metrics** (`src/components/CampaignMetrics.tsx`)

Displays comprehensive campaign analytics:

```tsx
<CampaignMetrics 
  campaignId="campaign-uuid" 
  className="mt-6" 
/>
```

**Shows:**
- Total sent/opens/clicks
- Open and click rates
- Per-step breakdown (toggleable)
- Performance insights

### 2. **Deliverability Settings** (`src/components/DeliverabilitySettings.tsx`)

Manage mailbox configurations:

```tsx
<DeliverabilitySettings />
```

**Features:**
- Add/edit mailbox configurations
- Set daily and hourly caps
- Configure warmup schedules
- View domain statistics

## ⚙️ Configuration

### 1. **Environment Variables**

Add to your `.env.local`:

```bash
# Cron job security
CRON_SECRET=your-secure-random-string

# Email provider webhook secrets (optional)
SES_WEBHOOK_SECRET=your-ses-secret
MAILGUN_WEBHOOK_SECRET=your-mailgun-secret
MAILERSEND_WEBHOOK_SECRET=your-mailersend-secret
```

### 2. **Email Provider Setup**

#### Amazon SES
```json
{
  "Type": "Notification",
  "Message": {
    "bounce": {
      "bounceType": "Permanent",
      "bouncedRecipients": [{"emailAddress": "bounced@example.com"}]
    }
  }
}
```

#### Mailgun
```json
{
  "event": "bounced",
  "recipient": "bounced@example.com",
  "message-id": "msg-id"
}
```

#### MailerSend
```json
{
  "type": "bounce",
  "data": {
    "email": "bounced@example.com",
    "hard_bounce": true
  }
}
```

## 🧪 Testing

### 1. **Test Hourly Caps**

```bash
# Set low daily cap (e.g., 8) → hourly resolves to 2
# Queue 5 contacts on same domain
# Observe only 2 send this hour, remainder rescheduled
```

### 2. **Test Warmup**

```bash
# Enable warmup for mailbox
# Start cap: 5, increment: 5/day, max: 200
# Verify daily cap doesn't exceed warmup limit
```

### 3. **Test Bounce Webhooks**

```bash
# Configure webhook endpoint
# Trigger bounce in your provider
# Verify contact suppression and queue purging
```

## 📊 Monitoring & Analytics

### 1. **Campaign Performance**

View per-step metrics in your campaign dashboard:

```sql
-- Get step-by-step performance
SELECT * FROM campaign_step_metrics 
WHERE campaign_id = 'your-campaign-id'
ORDER BY step_index;
```

### 2. **Domain Health**

Monitor sending patterns and caps:

```sql
-- Check hourly domain usage
SELECT * FROM domain_hourly_counters 
WHERE domain = 'yourdomain.com'
ORDER BY hour_start DESC;
```

### 3. **Bounce Tracking**

Analyze deliverability issues:

```sql
-- Get bounce summary
SELECT bounce_type, COUNT(*) 
FROM bounce_events 
WHERE user_id = 'your-user-id'
GROUP BY bounce_type;
```

## 🚨 Troubleshooting

### Common Issues

#### 1. **Hourly Caps Not Working**
- Check `domain_hourly_counters` table
- Verify `mailboxes` configuration
- Ensure cron job is running

#### 2. **Bounce Webhooks Not Processing**
- Check webhook endpoint URL
- Verify provider configuration
- Review server logs for errors

#### 3. **Step Metrics Missing**
- Ensure `step_index` is set in tracking tokens
- Check `campaign_step_metrics` table
- Verify tracking pixel injection

### Debug Commands

```bash
# Check cron job status
curl -H "Authorization: Bearer your-secret" \
     https://yourdomain.com/api/cron/send

# Test bounce webhook
curl -X POST https://yourdomain.com/api/webhooks/bounce \
     -H "Content-Type: application/json" \
     -d '{"test": "bounce"}'
```

## 🔄 Cron Job Setup

### 1. **Vercel Cron**

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### 2. **External Cron Service**

```bash
# Every 15 minutes
*/15 * * * * curl -H "Authorization: Bearer your-secret" \
  https://yourdomain.com/api/cron/send
```

## 📈 Performance Considerations

### 1. **Database Indexes**
- All critical queries are indexed
- Hourly counters use efficient time-based queries
- Step metrics use composite indexes

### 2. **Rate Limiting**
- Hourly caps prevent provider throttling
- Warmup schedules build reputation gradually
- Automatic rescheduling reduces failed sends

### 3. **Scalability**
- Per-domain counters scale horizontally
- Step metrics aggregate efficiently
- Bounce processing is asynchronous

## 🔐 Security

### 1. **Webhook Security**
- Validate webhook signatures (implement per-provider)
- Use HTTPS endpoints only
- Rate limit webhook processing

### 2. **Cron Security**
- Use strong `CRON_SECRET`
- Validate authorization headers
- Monitor for unauthorized access

### 3. **Data Privacy**
- RLS policies enforce user isolation
- Bounce data is user-scoped
- Audit logs for compliance

## 🚀 Deployment Checklist

- [ ] Run database migration
- [ ] Update environment variables
- [ ] Deploy updated libraries
- [ ] Configure email provider webhooks
- [ ] Set up cron job
- [ ] Test hourly caps and warmup
- [ ] Verify bounce processing
- [ ] Monitor initial metrics

## 📚 Additional Resources

- [SmartSend Core Documentation](./README.md)
- [Email Provider Integration Guides](./docs/)
- [Database Schema Reference](./supabase/migrations/)
- [API Endpoint Documentation](./src/app/api/)

## 🤝 Support

For implementation questions or issues:

1. Check the troubleshooting section above
2. Review server logs for error details
3. Verify database schema and RLS policies
4. Test individual components in isolation

---

**SmartSend Advanced Features** - Enterprise-grade email deliverability and analytics for modern cold email campaigns. 