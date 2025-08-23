# A/B Testing Implementation

This document describes the A/B testing system implemented for the upgrade banner to optimize conversion rates.

## Overview

The system allows you to run controlled experiments with different variants of UI elements (like the upgrade banner) and measure their performance through conversion tracking.

## Database Schema

### Tables Created

1. **`experiments`** - Stores experiment configuration
   - `id`: Unique identifier
   - `name`: Experiment name (e.g., "upgrade_banner")
   - `variants`: JSON array of variants with weights
   - `created_at`: Timestamp

2. **`experiment_assignments`** - Tracks which users see which variants
   - `user_id`: User identifier
   - `experiment_id`: Experiment reference
   - `variant`: Assigned variant (A, B, etc.)
   - `assigned_at`: Assignment timestamp

3. **`experiment_events`** - Logs user interactions
   - `user_id`: User identifier
   - `experiment_id`: Experiment reference
   - `variant`: Variant shown to user
   - `event`: Event type (viewed_banner, clicked_cta, converted)
   - `created_at`: Event timestamp

## Setup Instructions

### 1. Database Setup

Run the SQL commands in `database-setup.sql` in your Supabase SQL editor:

```sql
-- A/B Testing Tables
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  variants jsonb not null,
  created_at timestamptz default now()
);

-- ... (rest of the tables and indexes)
```

### 2. Insert Experiment

Insert the upgrade_banner experiment:

```sql
insert into public.experiments (name, variants) values
('upgrade_banner', '[{"key":"A","weight":0.5},{"key":"B","weight":0.5}]');
```

Or use the admin interface at `/admin/experiments`

### 3. API Endpoints

- **GET** `/api/experiments/[name]` - Get or assign variant
- **POST** `/api/experiments/event` - Log experiment events
- **POST** `/api/experiments/admin/insert` - Create new experiments (admin only)

## How It Works

### 1. Variant Assignment

When a user visits a page with the upgrade banner:
1. Frontend calls `/api/experiments/upgrade_banner`
2. API checks if user already has an assignment
3. If not, assigns a weighted random variant
4. Returns the variant and experiment ID

### 2. Event Tracking

The system tracks three key events:
- **`viewed_banner`** - User saw the banner
- **`clicked_cta`** - User clicked the CTA button
- **`converted`** - User upgraded to Pro (automatically tracked)

### 3. Conversion Attribution

When a user upgrades to Pro:
1. Stripe webhook triggers
2. `updateSubscriptionStatus` function runs
3. System checks for active experiment assignments
4. Logs "converted" events for all active experiments

## Variant Details

### Variant A (50% traffic)
- **Headline**: "🚀 Upgrade to Pro"
- **Subtext**: "Unlock full automation today."
- **CTA**: "Upgrade Now"

### Variant B (50% traffic)
- **Headline**: "💡 Don't leave meetings on the table"
- **Subtext**: "Pro users 2× their booked calls."
- **CTA**: "Start Pro →"

## Analytics & Reporting

### Weekly Report

Use the analytics functions to generate reports:

```typescript
import { getWeeklyExperimentReport } from "@/lib/experiments/analytics";

const report = await getWeeklyExperimentReport();
console.log(report);
```

### Key Metrics

- **Click-Through Rate (CTR)**: Clicks / Views
- **Conversion Rate**: Conversions / Views
- **Statistical Significance**: Compare variants to determine winner

## Frontend Integration

The `UpgradeBanner` component automatically:
1. Fetches variant assignment
2. Displays appropriate copy
3. Tracks view events
4. Tracks click events
5. Redirects to billing page

## Admin Interface

Visit `/admin/experiments` to:
- Create new experiments
- View experiment details
- Monitor performance

## Best Practices

1. **Traffic Allocation**: Start with 50/50 splits for statistical significance
2. **Duration**: Run experiments for at least 1-2 weeks
3. **Sample Size**: Ensure sufficient traffic for reliable results
4. **Monitoring**: Check conversion rates regularly
5. **Iteration**: Use results to inform future experiments

## Troubleshooting

### Common Issues

1. **No variants showing**: Check experiment exists in database
2. **Events not logging**: Verify API endpoints are accessible
3. **Conversion tracking**: Ensure Stripe webhook is configured

### Debug Queries

```sql
-- Check experiment configuration
select * from experiments where name = 'upgrade_banner';

-- View user assignments
select * from experiment_assignments where experiment_id = 'your-exp-id';

-- Check event counts
select variant, event, count(*) 
from experiment_events 
where experiment_id = 'your-exp-id' 
group by variant, event;
```

## Future Enhancements

- Multi-variant testing (A/B/C/D)
- Dynamic traffic allocation
- Statistical significance testing
- Automated winner selection
- Integration with analytics platforms
- Email/Slack reporting automation

## Security

- RLS policies protect user data
- Admin endpoints require @smartsend.ai email
- Experiment data is read-only for regular users
- No sensitive user information exposed 