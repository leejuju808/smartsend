# Block 32277 — SmartSend Roofing "Warranty Tracker + Service Visit Automation" v1

**IMPLEMENTATION COMPLETE ✅**

Track every homeowner's warranty • Auto-schedule annual inspections • Generate service revenue • Reduce callbacks and complaints

## 🎯 Overview

This feature transforms SmartSend into a comprehensive warranty management system that automatically:
- Creates warranty records when jobs are completed
- Schedules annual inspections
- Sends proactive reminders (30 days, 7 days, on due date, 20 days after missed)
- Detects warranty claims from homeowner messages
- Creates service visits automatically
- Boosts lead scores for warranty-connected homeowners

## 📦 What Was Built

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block32277_warranty_tracker_service_automation_v1.sql`

**Tables Created:**
1. `warranties` - Warranty records for completed jobs
2. `warranty_inspections` - Annual inspection tracking
3. `warranty_claims` - Warranty claim intake and tracking
4. `service_visits` - Service visit workflow

**Features:**
- Auto-creation trigger when job is completed
- Row Level Security (RLS) policies for team-based access
- Indexes for fast queries
- Helper functions for scheduling next inspections

### 2. Edge Function ✅

**File:** `supabase/functions/warranty-inspection-reminders/index.ts`

**Purpose:** Sends SMS + Email reminders for annual inspections

**Reminder Schedule:**
- 30 days before due date
- 7 days before due date
- On the due date
- 20 days after missed (with "missed" tag)

**Features:**
- Supports Twilio and Vonage/Nexmo SMS
- Email via Resend API or email-send function
- Graceful error handling
- Team-based SMS configuration support

### 3. API Routes ✅

**Warranty Operations:**
- `GET /api/warranties` - List warranties (with filters)
- `GET /api/warranties/[id]` - Get warranty details
- `POST /api/warranties` - Create warranty (manual)
- `PUT /api/warranties/[id]` - Update warranty

**Warranty Claims:**
- `POST /api/warranties/[id]/claims` - Create warranty claim
- `POST /api/warranties/claims/detect` - Auto-detect warranty claim from message

**Service Visits:**
- `GET /api/service-visits` - List service visits
- `POST /api/service-visits` - Create service visit

**Dashboard:**
- `GET /api/dashboard/warranty` - Get warranty dashboard data

### 4. UI Components ✅

**Warranty Dashboard:**
- **File:** `app/dashboard/warranty/page.tsx`
- Summary cards: Active warranties, Expiring (90 days), Inspections due, Open claims, Scheduled visits
- Sections for each category with links to detail pages

**Warranty Detail Page:**
- **File:** `app/dashboard/warranty/[id]/page.tsx`
- Warranty timeline
- Inspection history
- Service visits
- Warranty claims
- Homeowner and job information

### 5. Lead Score Integration ✅

**File:** `lib/lead-scoring/engine.ts`

**Score Boosts:**
- `+20` for contacting roofer first (loyalty signal)
- `+10` if warranty still active
- `+30` if claim mentions leak/active damage

**Function:** `applyWarrantyScoreBoost()` - Applies warranty-related score boosts

### 6. Pipeline Integration ✅

**Service Visits:**
- Automatically creates tasks in `tasks_v3` when service visits are scheduled
- Links to warranty and homeowner records
- Auto-generated with source: "warranty_system"

## 🚀 Setup Instructions

### 1. Run Database Migration

```bash
# The migration will be applied automatically on next deployment
# Or run manually:
supabase migration up
```

### 2. Deploy Edge Function

```bash
supabase functions deploy warranty-inspection-reminders
```

### 3. Set Up Cron Job

In Supabase Dashboard → Database → Cron Jobs, create a daily job:

```sql
SELECT cron.schedule(
  'warranty-inspection-reminders',
  '0 9 * * *', -- 9 AM daily
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/warranty-inspection-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### 4. Configure Environment Variables

Set in Supabase Dashboard → Edge Functions → Settings:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VONAGE_SMS_URL` (optional)
- `TWILIO_ACCOUNT_SID` (optional)
- `TWILIO_AUTH_TOKEN` (optional)
- `TWILIO_PHONE_NUMBER` (optional)
- `RESEND_API_KEY` (optional)

## 📊 How It Works

### Automatic Warranty Creation

When a job's stage changes to `completed`:
1. Trigger fires: `warranty_create_trigger`
2. Creates warranty record with 5-year expiration (default)
3. Creates first annual inspection (1 year from completion)

### Inspection Reminders

Daily cron job runs `warranty-inspection-reminders` function:
1. Finds all pending inspections
2. Calculates days until due date
3. Sends reminders at 30, 7, 0, and -20 days
4. Tags as "missed" after -20 day reminder

### Warranty Claim Detection

When homeowner sends a message:
1. Call `/api/warranties/claims/detect` with message text
2. Function detects warranty keywords (leak, damage, warranty, etc.)
3. Finds active warranty for homeowner
4. Creates warranty claim
5. Boosts lead score (+20 or +30 for urgent)
6. Creates service visit task

### Service Visit Workflow

1. Created automatically from warranty claims
2. Can be created manually via API
3. Links to warranty and homeowner
4. Creates pipeline task when scheduled
5. Tracks completion status

## 🎨 UI Features

### Warranty Dashboard

- **Summary Cards:** Quick view of key metrics
- **Active Warranties:** All warranties still valid
- **Expiring Soon:** Warranties expiring in next 90 days
- **Inspections Due:** Inspections due this month
- **Open Claims:** Active warranty claims
- **Scheduled Visits:** Upcoming service visits

### Warranty Detail Page

- **Warranty Timeline:** Start and expiration dates
- **Inspection History:** All scheduled and completed inspections
- **Service Visits:** All service visits for this warranty
- **Warranty Claims:** All claims and their status
- **Homeowner Info:** Contact details
- **Job Info:** Link to original job

## 💰 Revenue Impact

This feature generates recurring revenue through:

1. **Annual Inspections:** $99–$199 each
2. **Service Work:** $300–$1,200 each
3. **Reduced Callbacks:** Proactive inspections catch issues early
4. **Long-term Relationships:** Multi-year customer touchpoints
5. **Referrals:** Happy warranty customers refer others

## 🔧 Integration Points

### Job Completion
- Trigger: `warranty_create_trigger` on `jobs` table
- Action: Creates warranty and first inspection

### Message Processing
- Endpoint: `/api/warranties/claims/detect`
- Action: Detects warranty claims, creates claim, boosts score

### Lead Scoring
- Function: `applyWarrantyScoreBoost()`
- Action: Boosts scores for warranty-related activities

### Pipeline System
- Table: `tasks_v3`
- Action: Creates service visit tasks automatically

## 📝 Notes

- Warranties are automatically created when jobs are completed
- Inspection reminders run daily via cron job
- Warranty claims can be auto-detected from messages
- Service visits integrate with pipeline task system
- All operations respect team-based RLS policies

## 🐛 Troubleshooting

### Inspections Not Sending Reminders
- Check cron job is running
- Verify edge function is deployed
- Check SMS/Email configuration
- Review function logs in Supabase Dashboard

### Warranties Not Creating
- Verify trigger exists: `warranty_create_trigger`
- Check job stage is exactly `completed`
- Review trigger logs

### Score Boosts Not Applying
- Verify `applyWarrantyScoreBoost()` is called
- Check lead_score_events table for logged events
- Review function implementation

































