# Block 16800 — SmartSend Trials & Onboarding v2 Implementation

## Overview

This implementation creates a high-conversion roofer onboarding system that produces wins within the first 24-48 hours, turning SmartSend into a conversion machine.

## Features Implemented

### 1. Database Schema

**Migration:** `supabase/migrations/20250130000002_block16800_onboarding_v2.sql`

Creates 5 new tables:
- `onboarding_progress` - Tracks 5-step onboarding flow and 6 wins system
- `trial_events` - Tracks key events during trial
- `milestones` - Records milestone achievements
- `onboarding_recommendations` - AI-powered recommendations
- `trial_nudges` - Automated trial nudges

### 2. API Endpoints

All endpoints are under `/api/onboarding/v2/`:

- **GET/POST `/api/onboarding/v2/progress`** - Get/update onboarding progress
- **GET `/api/onboarding/v2/checklist`** - Get gamified checklist status
- **GET/POST `/api/onboarding/v2/milestones`** - Get/record milestones
- **GET/POST `/api/onboarding/v2/recommendations`** - Get/update recommendations
- **POST `/api/onboarding/v2/complete`** - Mark onboarding as complete

### 3. UI Components

#### Main Onboarding Flow
- **`app/onboarding/v2/page.tsx`** - Main onboarding page with step routing
- **`components/onboarding/v2/steps/Step1CompanySetup.tsx`** - Company setup form
- **`components/onboarding/v2/steps/Step2EmailConnect.tsx`** - Email connection & domain health
- **`components/onboarding/v2/steps/Step3ImportList.tsx`** - List import (CSV or sample)
- **`components/onboarding/v2/steps/Step4LaunchCampaign.tsx`** - Guided campaign launch
- **`components/onboarding/v2/steps/Step5BookInspection.tsx`** - Booking milestone

#### Supporting Components
- **`components/onboarding/v2/OnboardingChecklist.tsx`** - Gamified checklist (top-right corner)
- **`components/onboarding/v2/MilestoneTracker.tsx`** - 6 wins tracker

### 4. Workers

#### Milestone Tracker
- **`app/api/cron/onboarding/milestone-tracker/route.ts`**
- Runs every 15 minutes
- Automatically detects and records:
  - Win 4: Email Opened
  - Win 5: First Reply
  - Win 6: First Booking

#### Trial Nudge Worker
- **`app/api/cron/onboarding/trial-nudge/route.ts`**
- Runs every hour
- Sends automated nudges based on trial day:
  - Day 1: "Send your first campaign today"
  - Day 2: "Your storm list is ready to go"
  - Day 3: "3 warm leads waiting in your pipeline"
  - Day 4: "Improve your reply rate by connecting your scheduler"
  - Day 5: "You're close to booking your first inspection"
  - Day 6: "Upgrade now to unlock more campaigns"
  - Day 7: "Your trial ends today — keep your leads alive"

## The 5-Step Onboarding Flow

### Step 1: Company Setup
- Company name
- City + service areas
- Logo upload (optional)
- Owner/rep name
- **Goal:** Done in under 2 minutes

### Step 2: Connect Email & Domain Health Check
- Connect Gmail, Microsoft, or Custom Domain
- Instant domain reputation check
- Send limits display
- Safety warnings
- Warmup status
- **Goal:** Make system feel trustworthy and pro

### Step 3: Import Your First List
- Upload CSV
- Try Sample Roofing List (for cold start)
- After import:
  - List Intelligence runs
  - Storm data applied
  - Personalization engine builds data
  - Tasks created
  - Pipeline populated
- **Goal:** Give roofer instant momentum

### Step 4: Launch Your First Campaign (Guided)
- SmartSend recommends:
  - Storm campaign (if storm detected)
  - Old quote revival
  - Neighborhood outreach
- One-click setup:
  - Template selected
  - Personalization preview
  - Target list
  - Send timing
  - Safety checks
  - Warmup limits respected
- **Goal:** They hit SEND → SmartSend generates results FAST

### Step 5: Book Your First Inspection (Milestone)
- Milestone screen shows progress
- Guides roofer to:
  - Check inbox
  - See new tasks
  - Respond with AI suggestions
  - Send booking link
- **Goal:** When inspection is booked → onboarding success fireworks

## The 6 Wins System

1. **Win #1 — Email Connected** - Instant credibility
2. **Win #2 — First List Imported** - Pipeline fills up
3. **Win #3 — First Campaign Sent** - They feel power
4. **Win #4 — First Homeowner Opens Email** - Progress
5. **Win #5 — First Reply** - They trust the system
6. **Win #6 — First Booking** - This is when they decide to PAY

## Gamified Checklist

Visible in top-right corner:
- Shows completion percentage
- 6 checklist items with checkmarks
- Links to relevant steps/pages
- Auto-hides when 100% complete

## Recommendations Engine

Automatically generates recommendations based on:
- Company city/service areas (storm campaigns)
- List import status (old quote revival)
- Progress state (neighborhood outreach, insurance prep)

## Integration Points

### Billing Integration
- Checks `billing_accounts` table for trial status
- Links onboarding progress to billing account
- Ready for upgrade prompts at trial end

### Campaign Integration
- Links to campaign creation with pre-filled templates
- Tracks campaign sends for milestone detection
- Monitors email opens/replies for wins

### Email Integration
- Checks email connection status
- Validates domain health
- Monitors email events for milestones

## Next Steps

1. **Preloaded Templates** - Create roofing-specific templates with personalization
2. **Billing UI** - Create upgrade wall at trial end with plan recommendations
3. **Storm Detection** - Enhance recommendations with real-time storm data
4. **Notification System** - Integrate trial nudges with in-app notifications
5. **Email Nudges** - Send email versions of trial nudges

## Testing

To test the onboarding flow:

1. Create a new user account
2. Navigate to `/onboarding/v2`
3. Complete each step
4. Check milestones are recorded
5. Verify checklist updates
6. Test recommendations appear

## Cron Jobs

Add to `vercel.json`:
```json
{
  "path": "/api/cron/onboarding/milestone-tracker?key=${CRON_SECRET}",
  "schedule": "*/15 * * * *"
},
{
  "path": "/api/cron/onboarding/trial-nudge?key=${CRON_SECRET}",
  "schedule": "0 * * * *"
}
```

## Database Migration

Run the migration:
```bash
supabase migration up
```

Or apply manually:
```bash
psql -f supabase/migrations/20250130000002_block16800_onboarding_v2.sql
```

## Notes

- All components use client-side rendering for interactivity
- API endpoints use Supabase RLS for security
- Workers require CRON_SECRET for authentication
- Checklist auto-refreshes every 30 seconds
- Milestones are tracked automatically via workers





















































