# Revenue Growth System Implementation

Complete revenue growth infrastructure for SmartSend targeting $50K MRR by Q2 2026.

## 🎯 Overview

This implementation includes:
- **Usage-Based Billing 2.0**: Dynamic pricing ($0.003/email, $0.02/AI credit)
- **Referral System**: Track and reward referrals for growth loops
- **Agency/Reseller Plans**: White-label system with 20-40% revenue share
- **Integration Marketplace**: HubSpot, Slack, Pipedrive, Telegram, Notion connectors
- **AI Insights Hub**: Executive dashboard with churn prediction
- **Email Growth Loops**: Automated win notifications and usage recaps

## 📦 Database Schema

**Migration**: `supabase/migrations/20260102000000_revenue_growth_system.sql`

### Tables Created:
1. **metered_billing_items** - Stripe subscription items for usage billing
2. **usage_records** - Usage events to sync with Stripe API
3. **usage_credits** - Pre-purchased credits that deduct before metering
4. **referrals** - Referral tracking with conversion events
5. **referral_rewards** - Reward payouts for referrals
6. **reseller_accounts** - Agency/reseller accounts
7. **reseller_client_workspaces** - Client workspaces managed by resellers
8. **integrations** - Available integration connectors
9. **integration_tokens** - OAuth tokens per workspace
10. **integration_sync_logs** - Sync history for integrations
11. **ai_insights_metrics** - Daily metrics snapshots
12. **churn_prediction_events** - Churn risk scores and interventions
13. **growth_loop_events** - Growth automation tracking

## 🔌 API Endpoints

### Usage Tracking
- **POST** `/api/usage/record` - Record usage (emails_sent, ai_credits)
- **POST** `/api/usage/sync-stripe` - Cron: Sync pending usage to Stripe (run hourly)

### Referrals
- **POST** `/api/referrals/create` - Generate referral link for user
- **POST** `/api/referrals/track` - Track referral events (signup, conversion)

### Agencies/Resellers
- **POST** `/api/agencies/create` - Create reseller account (partner/pro/elite tiers)

### Integrations
- **GET** `/api/integrations/[service]` - Get integration connection status
- **POST** `/api/integrations/[service]` - Connect/update integration token

### AI Insights
- **GET** `/api/insights/dashboard` - Get workspace performance metrics

### Growth Loops
- **POST** `/api/growth-loops/win-notification` - Send milestone achievement email
- **POST** `/api/growth-loops/usage-recap` - Cron: Send weekly usage recap (run weekly)

## 💰 Usage-Based Billing Flow

1. **Email Sent** → `sendEmail()` calls `recordUsage(workspaceId, "emails_sent", 1)`
2. **Credits Check** → `record_usage_with_credits()` function checks for available credits
3. **Credit Deduction** → Uses credits first, then charges via Stripe
4. **Usage Record** → Creates record in `usage_records` table
5. **Stripe Sync** → Cron job syncs to Stripe `usage_record` API hourly
6. **Billing** → Stripe automatically invoices based on usage

### Pricing:
- **emails_sent**: $0.003 per email (0.3 cents)
- **ai_credits**: $0.02 per credit (rewrite/detect)

## 🔄 Referral Flow

1. User generates referral link: `POST /api/referrals/create`
2. Referred user signs up with `?ref=CODE`
3. System tracks: `POST /api/referrals/track` with `event_type: "signup"`
4. On conversion: `POST /api/referrals/track` with `event_type: "subscription"`
5. Reward created: $10 conversion bonus added to `referral_rewards`

## 🏢 Agency/Reseller Tiers

| Tier | Seats | Revenue Share | Branding |
|------|-------|----------------|----------|
| Partner | 10 | 20% | "Powered by SmartSend" |
| Pro | 50 | 30% | Custom logo |
| Elite | 100+ | 40% | Full white-label |

## 🔗 Integration Setup

### Supported Services:
- HubSpot (CRM sync)
- Slack (notifications)
- Pipedrive (deal sync)
- Telegram (bot notifications)
- Notion (contact export)

### Connection Flow:
1. User clicks "Connect [Service]"
2. OAuth redirect to service
3. Store token: `POST /api/integrations/[service]`
4. Background sync job processes data

## 📊 AI Insights Dashboard

### Metrics Tracked:
- Emails sent/opened/replied
- AI rewrites and detections used
- Conversion rates (reply/sent, reply/opened)
- Estimated ROI
- Churn risk score (0.0-1.0)

### Churn Prediction Factors:
- Days since last activity (30+ days = high risk)
- Subscription status (past_due = high risk)
- Declining usage trends

## 📧 Growth Loops

### Win Notifications:
Triggered on milestones:
- **first_reply**: "🎉 You got your first reply!"
- **ten_replies**: "🚀 10 replies! You're on fire"
- **first_conversion**: "💰 First conversion!"

### Usage Recaps:
Weekly emails sent to free users showing:
- Emails sent this week
- Replies received
- Reply rate
- Upgrade CTA to Pro

## 🚀 Setup Instructions

### 1. Run Database Migration

```bash
supabase db push
```

Or manually run:
```sql
-- Run supabase/migrations/20260102000000_revenue_growth_system.sql
```

### 2. Environment Variables

Add to `.env.local`:

```bash
# Stripe Usage-Based Pricing
STRIPE_PRICE_EMAILS_SENT=price_xxx  # Create in Stripe dashboard
STRIPE_PRICE_AI_CREDITS=price_xxx    # Create in Stripe dashboard

# Cron Secret (for scheduled jobs)
CRON_SECRET=your_random_secret_here

# Resend (for growth loop emails)
RESEND_API_KEY=re_xxx
```

### 3. Create Stripe Prices

In Stripe Dashboard:
1. Create Product: "SmartSend Emails"
   - Type: Metered billing
   - Unit: Email
   - Price: $0.003 per email
   - Copy Price ID → `STRIPE_PRICE_EMAILS_SENT`

2. Create Product: "SmartSend AI Credits"
   - Type: Metered billing
   - Unit: Credit
   - Price: $0.02 per credit
   - Copy Price ID → `STRIPE_PRICE_AI_CREDITS`

### 4. Set Up Cron Jobs

**Usage Sync** (hourly):
```bash
curl -X POST https://your-domain.com/api/usage/sync-stripe \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Usage Recap** (weekly):
```bash
curl -X POST https://your-domain.com/api/growth-loops/usage-recap \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or use Vercel Cron, GitHub Actions, or similar scheduler.

### 5. Integration Setup

Seed integration connectors:

```sql
INSERT INTO public.integrations (service_name, display_name, category, is_active) VALUES
  ('hubspot', 'HubSpot', 'crm', true),
  ('slack', 'Slack', 'communication', true),
  ('pipedrive', 'Pipedrive', 'crm', true),
  ('telegram', 'Telegram', 'communication', true),
  ('notion', 'Notion', 'productivity', true);
```

## 📈 Revenue Mechanics

### Usage Tracking:
- Automatically records when emails sent via `sendEmail()`
- Credits deducted first (trials, promotions)
- Then charges via Stripe metered billing

### Agency Revenue:
- Reseller creates client workspace
- Client pays monthly fee
- Reseller receives revenue share (20-40%)
- Tracked in `reseller_accounts.total_revenue_cents`

### Referral Rewards:
- $10 one-time bonus on conversion
- Tracked in `referral_rewards` table
- Paid out via Stripe Connect (future enhancement)

## 🎯 6-Month Roadmap Progress

| Month | Feature | Status |
|-------|---------|--------|
| Jan | Usage-based billing | ✅ Complete |
| Jan | Referral system | ✅ Complete |
| Feb | Agency/reseller system | ✅ Complete |
| Feb | White-label dashboard | ⏳ Next |
| Mar | Paid ads + affiliate launch | ⏳ Next |
| Apr | AI Insights Hub | ✅ Complete |
| May | Integration marketplace | ✅ Complete |
| Jun | Growth loops | ✅ Complete |

## 🔐 Security Notes

- All RLS policies enforced on new tables
- Service role required for usage tracking
- Cron endpoints protected with `CRON_SECRET`
- OAuth tokens stored encrypted (implement in production)

## 📝 Next Steps

1. **UI Components**: Build dashboard for insights, referrals, integrations
2. **White-label Dashboard**: Reseller-branded interface
3. **Stripe Connect**: Automated payouts for resellers
4. **Integration Implementations**: Build actual OAuth flows for each service
5. **Churn Interventions**: Automated emails for high-risk customers
6. **Analytics Enhancement**: Real-time dashboard with charts

## 🐛 Troubleshooting

### Usage not syncing to Stripe:
- Check `usage_records.synced_to_stripe = false`
- Verify cron job is running
- Check Stripe API logs for errors

### Credits not deducting:
- Verify `usage_credits` table has rows
- Check `expires_at` is not in the past
- Ensure `record_usage_with_credits` function is called

### Growth loops not sending:
- Check `growth_loop_events` table for sent status
- Verify Resend API key is set
- Check email delivery logs

---

**Status**: ✅ Core infrastructure complete, ready for UI integration

