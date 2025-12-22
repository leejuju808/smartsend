# Block 10000 — Beta Tracking Setup Guide

Quick implementation guide for the Silent Beta Playbook tracking system.

## Database Schema

The beta tracking system consists of three main tables:

### 1. `beta_testers`
Tracks the 3-5 roofing companies in the beta program.

**Key Fields:**
- `company_name` - Name of the roofing company
- `contact_person` - Primary contact name
- `contact_phone` / `contact_email` - Contact info
- `beta_status` - Current status (invited, onboarding, active, paused, cancelled, completed)
- `founders_beta_price_locked` - Locked-in $99/mo price
- Milestone timestamps: `first_campaign_launched_at`, `first_hot_lead_at`, `first_estimate_booked_at`, `converted_to_paid_at`

### 2. `beta_performance_metrics`
Daily aggregated metrics per beta tester.

**Key Fields:**
- `emails_sent`, `replies_received`, `hot_leads`
- `booked_estimates`, `jobs_closed`, `revenue_influenced`
- `bugs_found`, `feature_requests`

### 3. `beta_feedback`
Bugs, feature requests, and testimonials.

**Key Fields:**
- `feedback_type` - bug, feature_request, testimonial, general
- `severity` - low, medium, high, critical
- `status` - open, in_progress, fixed, closed, wont_fix

## Installation

Run the migration:

```bash
# Apply the migration
supabase migration up 20250130000007_block10000_beta_tester_tracking
```

## Usage Examples

### Adding a Beta Tester

```sql
INSERT INTO public.beta_testers (
  account_id,
  company_name,
  contact_person,
  contact_email,
  contact_phone,
  service_area,
  employee_count_range,
  beta_status,
  trial_started_at,
  trial_ends_at
) VALUES (
  'account-uuid-here',
  'ABC Roofing',
  'John Smith',
  'john@abcroofing.com',
  '555-123-4567',
  'Austin, TX',
  '6-10',
  'onboarding',
  now(),
  now() + interval '30 days'
);
```

### Recording Performance Metrics

```sql
INSERT INTO public.beta_performance_metrics (
  beta_tester_id,
  account_id,
  campaign_id,
  emails_sent,
  replies_received,
  hot_leads,
  booked_estimates
) VALUES (
  'beta-tester-uuid',
  'account-uuid',
  'campaign-uuid',
  150,
  12,
  3,
  1
) ON CONFLICT (beta_tester_id, metric_date, campaign_id) 
DO UPDATE SET
  emails_sent = EXCLUDED.emails_sent,
  replies_received = EXCLUDED.replies_received,
  hot_leads = EXCLUDED.hot_leads,
  booked_estimates = EXCLUDED.booked_estimates,
  updated_at = now();
```

### Recording Beta Feedback

```sql
INSERT INTO public.beta_feedback (
  beta_tester_id,
  account_id,
  feedback_type,
  title,
  description,
  severity
) VALUES (
  'beta-tester-uuid',
  'account-uuid',
  'bug',
  'Hot lead alert not firing',
  'When a reply comes in marked as hot, the SMS alert is not sent.',
  'high'
);
```

### Checking Beta Success Metrics

```sql
-- View all beta testers with success metrics
SELECT * FROM public.beta_success_metrics;

-- Check if beta goals are met
SELECT 
  COUNT(*) FILTER (WHERE onboarding_completed) as completed_onboarding,
  COUNT(*) FILTER (WHERE campaign_launched) as launched_campaigns,
  COUNT(*) FILTER (WHERE got_hot_leads) as got_hot_leads,
  COUNT(*) FILTER (WHERE booked_estimates) as booked_estimates,
  COUNT(*) FILTER (WHERE converted_to_paid) as converted_to_paid
FROM public.beta_success_metrics;
```

### Updating Beta Tester Milestones

```sql
-- Mark first hot lead
UPDATE public.beta_testers
SET first_hot_lead_at = now()
WHERE id = 'beta-tester-uuid'
  AND first_hot_lead_at IS NULL;

-- Mark first estimate booked
UPDATE public.beta_testers
SET first_estimate_booked_at = now()
WHERE id = 'beta-tester-uuid'
  AND first_estimate_booked_at IS NULL;

-- Mark conversion to paid
UPDATE public.beta_testers
SET converted_to_paid_at = now(),
    beta_status = 'active'
WHERE id = 'beta-tester-uuid'
  AND converted_to_paid_at IS NULL;
```

## Integration Points

### Campaign Launch Tracking

When a campaign is launched for a beta tester, update the milestone:

```typescript
// In your campaign launch handler
async function launchCampaign(campaignId: string, accountId: string) {
  // ... launch campaign logic ...
  
  // Update beta tester milestone
  await supabase
    .from('beta_testers')
    .update({ 
      first_campaign_launched_at: new Date().toISOString() 
    })
    .eq('account_id', accountId)
    .is('first_campaign_launched_at', null);
}
```

### Hot Lead Detection

When a hot lead is detected, update the milestone:

```typescript
// In your hot lead detection handler
async function onHotLeadDetected(leadId: string, accountId: string) {
  // ... hot lead logic ...
  
  // Update beta tester milestone
  await supabase
    .from('beta_testers')
    .update({ 
      first_hot_lead_at: new Date().toISOString() 
    })
    .eq('account_id', accountId)
    .is('first_hot_lead_at', null);
}
```

### Subscription Conversion

When a beta tester converts to paid, update the milestone:

```typescript
// In your Stripe webhook handler
async function onSubscriptionCreated(subscription: Stripe.Subscription) {
  // ... subscription logic ...
  
  // Find beta tester and mark conversion
  const { data: betaTester } = await supabase
    .from('beta_testers')
    .select('id')
    .eq('account_id', accountId)
    .single();
    
  if (betaTester) {
    await supabase
      .from('beta_testers')
      .update({ 
        converted_to_paid_at: new Date().toISOString(),
        beta_status: 'active'
      })
      .eq('id', betaTester.id);
  }
}
```

## Dashboard Queries

### Beta Program Health Check

```sql
SELECT 
  COUNT(*) as total_beta_testers,
  COUNT(*) FILTER (WHERE beta_status = 'active') as active,
  COUNT(*) FILTER (WHERE beta_status = 'onboarding') as onboarding,
  COUNT(*) FILTER (WHERE beta_status = 'completed') as completed,
  AVG(satisfaction_rating) as avg_satisfaction,
  SUM(total_bugs_found) as total_bugs,
  SUM(total_feature_requests) as total_features
FROM public.beta_success_metrics;
```

### Beta Goal Tracking

```sql
-- Check against success metrics from playbook
SELECT 
  CASE 
    WHEN COUNT(*) FILTER (WHERE onboarding_completed) >= 3 THEN '✅'
    ELSE '❌'
  END as onboarding_goal,
  CASE 
    WHEN COUNT(*) FILTER (WHERE campaign_launched) >= 3 THEN '✅'
    ELSE '❌'
  END as campaign_goal,
  CASE 
    WHEN COUNT(*) FILTER (WHERE got_hot_leads) >= 2 THEN '✅'
    ELSE '❌'
  END as hot_leads_goal,
  CASE 
    WHEN COUNT(*) FILTER (WHERE booked_estimates) >= 1 THEN '✅'
    ELSE '❌'
  END as estimates_goal,
  CASE 
    WHEN COUNT(*) FILTER (WHERE converted_to_paid) >= 1 THEN '✅'
    ELSE '❌'
  END as revenue_goal
FROM public.beta_success_metrics;
```

## Next Steps

1. ✅ Run the migration
2. ✅ Create admin UI for managing beta testers
3. ✅ Integrate milestone tracking into campaign/hot lead flows
4. ✅ Build beta performance dashboard
5. ✅ Set up automated metrics collection
6. ✅ Create beta feedback collection UI

See `BLOCK_10000_SILENT_BETA_PLAYBOOK.md` for the complete playbook.
























































