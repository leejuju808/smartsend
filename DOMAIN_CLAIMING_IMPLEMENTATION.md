# Domain Claiming System Implementation

This document outlines the implementation of SmartSendAI's domain claiming system, which automatically detects when multiple users from the same company domain sign up and encourages domain owners to claim their domain for team auto-join functionality.

## Overview

The system works as follows:
1. **Detection**: Monitors signups from company domains (excludes personal email providers)
2. **Threshold**: Triggers when 3+ users sign up from the same domain in 30 days, or 2+ for Pro users
3. **Nudging**: Shows banner notifications to encourage domain claiming
4. **Auto-join**: Once claimed and verified, new users from that domain automatically join the team
5. **Seat sync**: Automatically syncs team seats to Stripe billing

## Components Implemented

### 1. Database Layer (`supabase/migrations/20250131_create_recent_domain_signups.sql`)

- **Materialized View**: `recent_domain_signups` tracks domain activity over last 30 days
- **Refresh Function**: `refresh_recent_domain_signups()` for updating the view
- **Notification Function**: `domains_to_notify()` identifies domains needing owner notifications

### 2. API Endpoints

#### `/api/domains/suggest` (GET)
- Returns domains the current user should claim
- Respects subscription status (Pro users get lower thresholds)
- Excludes already claimed domains

#### `/api/domains/notify-owner` (POST)
- Sends email notifications to Pro users on domains over threshold
- Tracks notification events in analytics

### 3. UI Components

#### `DomainNudge` Component
- Banner displayed in dashboard and settings
- Shows domain activity count and claim button
- Integrates with existing claim flow

### 4. Automation Scripts

#### `scripts/refresh-domain-signups.ts`
- Refreshes materialized view
- Optionally sends domain notifications
- Designed for cron job execution

## Setup Instructions

### 1. Database Migration

Run the SQL migration in your Supabase dashboard:

```sql
-- This creates the materialized view and functions
-- Run in Supabase SQL Editor
```

### 2. Environment Variables

Ensure these are set in your `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Cron Job Setup

Set up a cron job to refresh the materialized view hourly:

```bash
# Add to your crontab or GitHub Actions
0 * * * * cd /path/to/smartsend-ai && npm run refresh-domains
```

Or manually run:
```bash
npm run refresh-domains
```

### 4. Optional: Email Notifications

To enable automatic email notifications, uncomment the notification code in `scripts/refresh-domain-signups.ts` and ensure your email API endpoint is working.

## How It Works

### User Flow

1. **Multiple signups** from `@company.com` within 30 days
2. **Dashboard banner** appears: "We noticed X teammates from company.com. Claim your domain..."
3. **User clicks "Claim domain"** → API returns DNS TXT instructions
4. **User verifies domain** via DNS record
5. **Future signups** from `@company.com` automatically join the team
6. **Seats sync** to Stripe billing automatically

### Threshold Logic

- **Free users**: Banner shows when 3+ users from same domain
- **Pro users**: Banner shows when 2+ users from same domain
- **Personal domains**: Excluded (gmail.com, yahoo.com, etc.)

### Auto-join Behavior

Once a domain is claimed and verified:
- New users with matching email domain automatically join the team
- Team membership is created automatically
- Stripe seats are synced via existing `syncSeatsToStripe()` function

## Customization

### Threshold Adjustments

Modify thresholds in `/api/domains/suggest/route.ts`:

```typescript
const shouldSuggest = !!agg && (agg.users_30d >= 3 || (agg.users_30d >= 2 && isPro));
```

### Blocked Domains

Update the `BLOCK` set in the suggest API to exclude additional personal email providers:

```typescript
const BLOCK = new Set([
  "gmail.com", "yahoo.com", "outlook.com", 
  "icloud.com", "hotmail.com", "aol.com"
]);
```

### Banner Styling

Customize the `DomainNudge` component appearance in `src/components/DomainNudge.tsx`.

## Monitoring & Analytics

### Events Tracked

- `domain_nudge_sent`: When notifications are sent to domain owners
- Domain claim attempts and verifications (via existing claim flow)

### Key Metrics

- Domains over threshold
- Claim conversion rates
- Auto-join success rates

## Troubleshooting

### Common Issues

1. **Materialized view not updating**: Ensure cron job is running and `refresh_recent_domain_signups()` function exists
2. **Banner not showing**: Check browser console for API errors, verify user has team_id
3. **Auto-join not working**: Verify domain is verified in `company_domains` table

### Debug Commands

```sql
-- Check recent domain activity
SELECT * FROM recent_domain_signups ORDER BY users_30d DESC;

-- Check claimed domains
SELECT * FROM company_domains WHERE verified = true;

-- Manual refresh
SELECT refresh_recent_domain_signups();
```

## Security Considerations

- Domain claiming requires owner/admin role on team
- Cross-team domain conflicts are prevented
- Personal email domains are blocked from claiming
- All operations require authentication

## Future Enhancements

- **Domain analytics dashboard** showing signup trends
- **Bulk domain claiming** for enterprise customers
- **Domain health scoring** based on email deliverability
- **Integration with company databases** for automatic domain discovery 