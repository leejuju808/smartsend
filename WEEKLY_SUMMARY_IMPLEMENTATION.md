# Weekly Summary Implementation

This document outlines the implementation of a weekly summary system for SmartSendAI that tracks key metrics and sends automated reports.

## Overview

The weekly summary system consists of three main components:

1. **Webhook Event Tracking** - Enhanced Stripe webhooks that emit churn/upgrade events
2. **Weekly Summary Script** - Node.js script that generates and sends reports
3. **GitHub Actions Workflow** - Automated scheduling to run weekly

## 1. Webhook Event Tracking

### Events Added

The following events are now tracked in the `events` table:

- **`subscribed_pro`** - When a user subscribes to Pro plan
- **`subscription_canceled`** - When a subscription is canceled
- **`trial_started`** - When a trial subscription begins

### Implementation Details

- Events are inserted after profile/workspace updates in the Stripe webhook
- Uses `supabaseAdmin` client for database operations
- Includes metadata like `stripe_subscription_id` and `status`
- Handles both workspace-based and profile-based subscriptions

### Database Schema

The events are stored in the existing `events` table:

```sql
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event text not null,
  meta jsonb,
  created_at timestamptz default now()
);
```

## 2. Weekly Summary Script

### Location
`scripts/weekly-summary.ts`

### Features

- **Topline Metrics**: Signups, checkout initiations, new Pro subscriptions, cancellations
- **Conversion Tracking**: Signup to Pro conversion rate
- **Usage Metrics**: Contacts imported, active Pro users
- **Email Delivery**: Uses Resend to send formatted reports

### Metrics Tracked

- `signup` - User registrations
- `trial_started` - Trial subscriptions started
- `checkout_initiated` - Checkout sessions started
- `subscribed_pro` - New Pro subscriptions
- `subscription_canceled` - Cancellations
- `contacts_imported` - Total contacts imported

### Manual Testing

```bash
npm run weekly:summary
```

## 3. GitHub Actions Workflow

### Location
`.github/workflows/weekly-summary.yml`

### Schedule
- **Automatic**: Every Monday at 16:00 UTC
- **Manual**: Can be triggered manually via GitHub Actions

### Environment Variables Required

The following secrets must be configured in GitHub:

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `RESEND_API_KEY` - Resend email service API key
- `RESEND_FROM` - Sender email address
- `NEXT_PUBLIC_SITE_URL` - Your site URL
- `ADMIN_REPORT_EMAILS` - Comma-separated list of admin emails

## Environment Setup

### Local Development

Add these variables to your `.env.local`:

```env
ADMIN_REPORT_EMAILS=you@yourdomain.com,partner@yourdomain.com
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=SmartSendAI <hello@yourdomain.com>
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### Production Deployment

Ensure all required environment variables are set in your deployment platform (Vercel, etc.).

## Sample Report Output

```
SmartSendAI — Weekly Summary (2025-01-13 → 2025-01-20)

Topline
• Signups: 45
• Checkout initiated: 23
• New Pro: 18
• Canceled: 3
• Active Pro (now): 156
• Est. signup→Pro conversion: 40.0%

Usage (leading indicators)
• Contacts imported: 1,247

Quick links
• Dashboard: https://yourdomain.com/dashboard/analytics
• Billing:   https://yourdomain.com/dashboard/billing
```

## Monitoring and Debugging

### Check Event Generation

```sql
-- View recent subscription events
SELECT event, meta, created_at 
FROM events 
WHERE event IN ('subscribed_pro', 'subscription_canceled', 'trial_started')
ORDER BY created_at DESC 
LIMIT 10;
```

### Test Webhook Events

Use Stripe's webhook testing tools to verify event generation:
1. Go to Stripe Dashboard > Webhooks
2. Select your webhook endpoint
3. Send test events for `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

### Manual Script Execution

```bash
# Test locally
npm run weekly:summary

# Test with specific environment
NODE_ENV=production npm run weekly:summary
```

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**: Ensure all required secrets are set in GitHub Actions
2. **Database Permissions**: Verify `SUPABASE_SERVICE_ROLE_KEY` has write access to `events` table
3. **Resend API Issues**: Check API key validity and sender email configuration
4. **Webhook Failures**: Monitor webhook delivery in Stripe Dashboard

### Debug Mode

Add logging to the webhook by checking console output in your deployment logs.

## Future Enhancements

- **Custom Date Ranges**: Allow manual date range selection
- **Additional Metrics**: Email open rates, reply rates, campaign performance
- **Slack Integration**: Send summaries to Slack channels
- **Custom Templates**: Allow admins to customize report format
- **Historical Trends**: Compare week-over-week performance

## Security Considerations

- **Service Role Key**: Only used in server-side operations
- **Webhook Verification**: Stripe signature verification prevents spoofing
- **Email Validation**: Admin emails are validated before sending
- **Rate Limiting**: Built-in idempotency prevents duplicate processing 