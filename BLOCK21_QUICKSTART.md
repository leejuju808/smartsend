# Block 21: Quick Start Guide

## 🎯 What Was Implemented

Complete observability system with logs, metrics, health checks, and alerts.

## ✅ Ready to Use

All components are already implemented and working:

1. **Database**: Migration applied, tables and views created
2. **Logger**: Library ready in `src/lib/logger.ts`
3. **Alerts**: Slack/Resend integration in `src/lib/alerts.ts`
4. **Dashboards**: Admin pages at `/dashboard/admin/metrics` and `/dashboard/admin/health`
5. **Health Checks**: API routes created
6. **Navigation**: Sidebar links added

## 🚀 Quick Test

### 1. Start Your Dev Server
```bash
npm run dev
```

### 2. Test Logging
```bash
curl http://localhost:3000/api/log/test
```

### 3. Visit Admin Dashboards

**Metrics Dashboard**: http://localhost:3000/dashboard/admin/metrics
**Health Dashboard**: http://localhost:3000/dashboard/admin/health

**Note**: Make sure your email is in `ADMIN_EMAILS` env var

### 4. Test Health Checks
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/stripe
curl http://localhost:3000/api/health/edge
```

## 📝 Add Logging to Your Code

### Basic Usage

```typescript
import { log } from '@/lib/logger';

// Info log
await log.info('general', 'User completed onboarding', {
  user_id: userId,
  workspace_id: workspaceId
});

// Warning
await log.warn('send_queue', 'Rate limit approaching', {
  user_id: userId,
  sent_today: 140
});

// Error with stack trace
try {
  await riskyOperation();
} catch (error) {
  await log.error('send_queue', 'Operation failed', 
    { operation: 'send_email', recipient: email },
    userId,  // actor
    error    // stack trace
  );
}
```

### Already Integrated

These systems already use logging:
- ✅ Stripe webhook handler
- ✅ Referral credit system
- ✅ Error boundary (frontend)

## 🔔 Set Up Alerts (Optional)

Add to your `.env`:

```bash
# Slack alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# Email alerts (Resend)
RESEND_API_KEY=re_YOUR_API_KEY
ALERT_EMAIL_TO=you@domain.com
ALERT_EMAIL_FROM=alerts@smartsendhq.com
```

Alerts automatically fire for:
- `send_queue` errors
- `stripe_webhook` errors
- `bounce_classifier` errors

## 📊 View Metrics

**Admin → Metrics** shows:
- Email volume (24h/7d)
- Deliverability scores
- Error counts by category
- Active customers
- Charts and visualizations

**Admin → Health** shows:
- Database connectivity
- Stripe API status
- Edge Functions status
- Environment validation

## 🗄️ Database Queries

### View Recent Logs
```sql
SELECT * FROM system_logs 
ORDER BY created_at DESC 
LIMIT 50;
```

### Check Log Stats
```sql
SELECT * FROM view_log_stats;
```

### Find Errors by Category
```sql
SELECT category, count(*) as error_count
FROM system_logs 
WHERE level = 'error'
AND created_at >= now() - interval '24 hours'
GROUP BY category;
```

## 🔍 Monitor in Production

### Key Metrics
1. Error rate trend (admin dashboard)
2. Database latency (health dashboard)
3. Log volume growth (prevent bloat)
4. Alert frequency (adjust thresholds)

### Cleanup Old Logs
Run weekly to prevent storage bloat:

```sql
DELETE FROM system_logs 
WHERE created_at < now() - interval '90 days';
```

## 📚 Full Documentation

See `BLOCK21_IMPLEMENTATION.md` for complete details.

## 🎉 You're Done!

The observability system is fully operational. Just add logging calls where needed in your critical code paths.

