# Block 25420 — SmartSend Roofing Marketing Engine v1

## Implementation Summary

The Marketing Engine v1 is a comprehensive marketing automation system designed specifically for roofing companies. It provides everything roofers need to generate consistent leads and booked appointments without relying on expensive ads or agencies.

## Core Components Implemented

### 1. Database Schema (`supabase/migrations/20250130000001_block25420_marketing_engine_v1.sql`)

- **marketing_campaigns** - Main campaigns table with support for multiple campaign types
- **marketing_campaign_recipients** - Tracks recipients and their engagement
- **seasonal_templates** - Pre-built seasonal email templates
- **referral_automation** - Referral campaign automation configuration
- **referral_tracking** - Individual referral request tracking
- **storm_campaign_triggers** - Links storm events to marketing campaigns
- **lead_nurture_sequences** - Pre-configured nurture sequences
- **lead_nurture_enrollments** - Tracks lead enrollment in nurture sequences
- **marketing_analytics** - Aggregated campaign analytics
- **local_targeting_config** - Local targeting configuration

### 2. API Endpoints

#### Marketing Campaigns
- `GET /api/marketing/campaigns` - List all campaigns
- `POST /api/marketing/campaigns` - Create new campaign
- `GET /api/marketing/campaigns/[id]` - Get campaign details
- `PATCH /api/marketing/campaigns/[id]` - Update campaign
- `DELETE /api/marketing/campaigns/[id]` - Delete campaign
- `POST /api/marketing/campaigns/[id]/launch` - Launch campaign and enroll recipients

#### Seasonal Templates
- `GET /api/marketing/seasonal-templates` - List seasonal templates
- `POST /api/marketing/seasonal-templates` - Create seasonal template

#### Referral Automation
- `GET /api/marketing/referral-automation` - List referral automation configs
- `POST /api/marketing/referral-automation` - Create referral automation

#### Storm Campaign Triggers
- `GET /api/marketing/storm-triggers` - List storm triggers
- `POST /api/marketing/storm-triggers` - Create storm trigger
- `POST /api/marketing/storm-triggers/[id]/approve` - Approve and launch storm campaign

#### Lead Nurture
- `GET /api/marketing/nurture/sequences` - List nurture sequences
- `POST /api/marketing/nurture/sequences` - Create nurture sequence

#### Newsletters
- `GET /api/marketing/newsletters` - List newsletters
- `POST /api/marketing/newsletters` - Create newsletter

#### Analytics
- `GET /api/marketing/analytics` - Get campaign analytics

### 3. Helper Libraries

#### Local Targeting (`src/lib/marketing/local-targeting.ts`)
- `findContactsByTargeting()` - Find contacts by ZIP, neighborhood, county, etc.
- `findLeadsByTargeting()` - Find leads by targeting criteria
- `findContactsInCustomerClusters()` - Find contacts in areas with multiple completed jobs
- `findContactsInStormPath()` - Find contacts affected by storms

#### Referral Automation (`src/lib/marketing/referral-automation.ts`)
- `triggerReferralAfterJobCompletion()` - Trigger referral request after job completion
- `triggerReferralAfterLeadCreation()` - Trigger referral request after lead creation
- `processReferralReply()` - Process referral replies and create leads

#### Storm Detection (`src/lib/marketing/storm-detection.ts`)
- `processStormEventForMarketing()` - Process storm events and create campaign triggers
- `autoApproveStormCampaign()` - Auto-approve storm campaigns if configured

#### Lead Nurture Engine (`src/lib/marketing/nurture-engine.ts`)
- `enrollLeadInNurtureSequence()` - Enroll a lead in a nurture sequence
- `autoEnrollLeadsInNurture()` - Auto-enroll leads matching criteria
- `processNurtureSequenceSteps()` - Process and send nurture sequence emails

#### Analytics (`src/lib/marketing/analytics.ts`)
- `aggregateCampaignAnalytics()` - Aggregate campaign metrics
- `getCampaignPerformanceSummary()` - Get campaign performance summary
- `trackMarketingEvent()` - Track email events (open, click, reply, etc.)

### 4. UI Components

#### Marketing Dashboard (`src/app/dashboard/marketing/page.tsx`)
- Main dashboard showing all campaigns
- Campaign performance metrics
- Quick actions to create campaigns

## Campaign Types Supported

1. **Inspection Campaign** - Annual roof inspection reminders
2. **Insurance Education** - Educate homeowners about insurance coverage
3. **Previous Estimates** - Follow up on quotes that weren't approved
4. **Referral Campaign** - Automated referral requests
5. **Seasonal Campaign** - Spring, Summer, Fall, Winter templates
6. **Storm Outbound** - Rapid response to storm events
7. **Lead Nurture** - Automatic nurture sequences for old leads
8. **Newsletter** - Monthly updates and educational content
9. **Customer Database** - Marketing to past customers
10. **Custom** - Custom campaigns

## Local Targeting Options

- **ZIP Code** - Target specific ZIP codes
- **Neighborhood** - Target specific neighborhoods
- **County** - Target entire counties
- **Storm Path** - Target storm-affected areas
- **Customer Clusters** - Target areas with multiple completed jobs
- **Radius** - Target within X miles of a point

## Seasonal Templates Included

### Spring
- Leak Prevention Campaign - "Rain season is coming — make sure your roof is ready"

### Summer
- Heat Damage Campaign - "Shingle cracking is common in high heat. Free inspection this week"

### Fall
- Winter Prep Campaign - "Snow and ice damage roofs. Let us check ventilation + flashing"

### Winter
- Emergency Repair Campaign - "If your roof leaks this winter, we offer emergency tarping + repair"

## Lead Nurture Sequence (Default)

5-step automatic sequence:
1. "Still thinking about a new roof? Here's what to look for" (Day 0)
2. "Insurance may cover more than you think" (Day 7)
3. "Here's how to check for shingle granule loss" (Day 14)
4. "What's the best time of year to replace your roof?" (Day 21)
5. "We're offering free inspections this week" (Day 28)

## Analytics Tracked

- Recipients
- Sent
- Delivered
- Opened
- Clicked
- Replied
- Booked
- Revenue
- Unsubscribed
- Bounced

Plus calculated rates:
- Open Rate
- Click Rate
- Reply Rate
- Booking Rate
- Unsubscribe Rate

## Next Steps

1. **Integrate with Email Sending System** - Connect campaign launches to your email queue
2. **Add UI for Campaign Creation** - Build forms for creating campaigns
3. **Add Campaign Editor** - Allow editing of campaign content
4. **Add Analytics Dashboard** - Visual charts and graphs for campaign performance
5. **Add Template Editor** - UI for creating and editing templates
6. **Add Referral Reply Handler** - Process referral replies via email/webhook
7. **Add Storm Detection Integration** - Connect to weather APIs for automatic storm detection
8. **Add Cron Jobs** - Schedule automatic processing of nurture sequences and analytics

## Usage Examples

### Create a Seasonal Campaign

```typescript
const response = await fetch('/api/marketing/campaigns', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workspace_id: 'workspace-id',
    name: 'Spring Leak Prevention',
    campaign_type: 'seasonal',
    season: 'spring',
    subject_template: 'Rain season is coming — make sure your roof is ready',
    body_template: 'Hi {{first_name}}, ...',
    targeting_type: 'all',
  }),
});
```

### Launch a Campaign

```typescript
const response = await fetch(`/api/marketing/campaigns/${campaignId}/launch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ approve: true }),
});
```

### Get Campaign Analytics

```typescript
const response = await fetch(
  `/api/marketing/analytics?workspace_id=${workspaceId}&campaign_id=${campaignId}`
);
const { analytics, summary } = await response.json();
```

## Key Features

✅ **Zero Fluff** - Everything roofers need, nothing they don't
✅ **Automated** - Set it and forget it marketing
✅ **Local Targeting** - Hyper-local marketing for highest conversion
✅ **Storm Response** - Rapid response to storm events
✅ **Lead Nurture** - Automatic follow-up for old leads
✅ **Referral Automation** - Generate referrals automatically
✅ **Seasonal Templates** - Ready-to-send seasonal campaigns
✅ **Full Analytics** - Track everything from opens to revenue

## Making SmartSend Unreplaceable

Once SmartSend becomes:
- The lead generator
- The referral engine
- The nurture engine
- The storm responder
- The local targeting system
- The seasonal campaign engine

Roofers realize: **"SmartSend literally creates revenue for us."**

Canceling SmartSend = losing leads = losing money.

They will never cancel.




































