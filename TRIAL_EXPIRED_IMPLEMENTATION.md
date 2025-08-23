# Trial Expired Email Implementation

This document describes the implementation of the "Trial Expired" email nudge system that automatically sends emails to users when their 7-day trial ends.

## Overview

When a user's trial expires, they automatically receive a clear email prompting them to upgrade to keep their campaigns, AI replies, and automations running.

## Components

### 1. Database Table: `trial_emails`

The `trial_emails` table tracks which users have been sent trial expired emails to prevent duplicate sends.

```sql
-- Migration: 20250117_create_trial_emails.sql
create table if not exists public.trial_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  type text not null check (type in ('trial_expired')),
  created_at timestamptz default now(),
  unique(user_id, type)
);
```

### 2. Script: `scripts/send-trial-expired.ts`

The script that identifies users whose trials have expired and sends them upgrade emails.

**Key Features:**
- Finds profiles with `subscription_status = 'free'` and `trial_end <= now`
- Prevents duplicate emails using the `trial_emails` table
- Comprehensive logging with Pino
- Error handling for individual email failures
- Uses Resend for email delivery

**Usage:**
```bash
npm run trial:expired
```

### 3. GitHub Workflow: `.github/workflows/trial-expired.yml`

Automated daily execution at 14:00 UTC to send trial expired emails.

**Schedule:** Daily at 14:00 UTC (2:00 PM UTC)
**Manual Trigger:** Available via `workflow_dispatch`

## How It Works

1. **Daily Execution**: The GitHub workflow runs every day at 14:00 UTC
2. **User Identification**: Finds users whose trials ended and status is now 'free'
3. **Duplicate Prevention**: Checks if a trial expired email was already sent
4. **Email Delivery**: Sends personalized upgrade email via Resend
5. **Tracking**: Records the email send in the `trial_emails` table

## Email Template

```
Subject: Your SmartSendAI trial has ended

Hi [email],

Your SmartSendAI trial just ended. Don't lose the campaigns, AI replies, and automations you've set up.

Upgrade today to keep everything running:
[BILLING_URL]/dashboard/billing

– The SmartSendAI Team
```

## Environment Variables Required

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `RESEND_API_KEY`: Resend API key for email delivery
- `RESEND_FROM`: Sender email address
- `NEXT_PUBLIC_SITE_URL`: Your application's base URL

## Testing

To test the script manually:

1. Ensure environment variables are set
2. Run: `npm run trial:expired`
3. Check logs for execution details
4. Verify emails are sent and tracked in database

## Monitoring

The script provides comprehensive logging:
- Start/completion events
- Count of emails sent/skipped
- Individual email success/failure tracking
- Error details with stack traces

## Database Schema

### `trial_emails` Table
- `id`: Unique identifier
- `user_id`: Reference to profiles table
- `email`: User's email address
- `type`: Email type (currently only 'trial_expired')
- `created_at`: Timestamp of email send

### Indexes
- `idx_trial_emails_user_type`: For efficient duplicate checking
- `idx_trial_emails_created_at`: For audit and cleanup operations

## Future Enhancements

- Support for multiple email types (trial ending soon, trial expired, etc.)
- A/B testing for email content
- Integration with analytics for conversion tracking
- Customizable email templates per user segment 