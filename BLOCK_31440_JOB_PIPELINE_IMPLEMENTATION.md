# Block 31440 — SmartSend Roofing "Job Pipeline + Production Tracking Engine" v1

**IMPLEMENTATION COMPLETE ✅**

Track every job from estimate → signed → production → completion • Auto-update customers • Keep roofers organized • Prevent job delays

## 🎯 Overview

This feature transforms SmartSend into a true revenue + operations engine for roofing companies, not just a lead tool. It provides:

- **7-Stage Job Pipeline** (Estimate → Approved → Insurance → Materials → Scheduled → In Progress → Completed)
- **Automatic Customer Updates** (SMS + Email when stages change)
- **Material Tracking** (Supplier, delivery dates, status)
- **Crew Scheduling** (Assign crews, dates, duration)
- **Production Dashboard** (Metrics: jobs this week, behind schedule, awaiting materials, ready for payment, completion rate)
- **Photo Management** (Before, during, after photos)
- **Production Tasks** (Auto-created tasks based on stage)
- **Internal Notes** (Per-job notes for contractors)

## 📦 What Was Built

### Database Schema ✅

**File:** `supabase/migrations/20250201000000_block31440_job_pipeline_v1.sql`

**Tables Created:**
1. `jobs` - Main jobs table with 7 stages
2. `job_stage_events` - Audit trail of stage changes
3. `job_materials` - Material tracking (supplier, type, dates, delivery status)
4. `job_schedule` - Crew scheduling (crew name, start date, duration)
5. `job_photos` - Photo storage (before, during, after)
6. `job_tasks` - Production tasks (auto-created and manual)

**Features:**
- Row Level Security (RLS) policies for team-based access
- Database triggers for automatic stage event logging
- Auto-creation of tasks when jobs move to specific stages
- Helper functions: `get_jobs_by_stage()` and `get_production_dashboard()`
- Storage bucket setup for job photos

### Edge Function ✅

**File:** `supabase/functions/send-job-update/index.ts`

**Purpose:** Sends SMS + Email notifications to customers when job stage changes

**Features:**
- Stage-specific messages for each of the 7 stages
- SMS support (Twilio, Vonage/Nexmo)
- Email support (via email-send function or Resend API)
- Graceful error handling (continues even if notifications fail)
- Team-based SMS configuration support

### API Routes ✅

1. **`/api/jobs/create`** - Create a new job from a lead
2. **`/api/jobs/update-stage`** - Update job stage and trigger customer notifications

**Note:** Materials, schedule, photos, and tasks are managed directly via Supabase client in components (no separate API routes needed due to RLS).

### UI Components ✅

#### Pipeline Kanban Board
**File:** `app/(dashboard)/production/pipeline/page.tsx`  
**Component:** `app/(dashboard)/production/pipeline/components/JobPipelineKanban.tsx`

**Features:**
- Drag-and-drop between 7 stages
- Real-time updates via Supabase subscriptions
- Job cards show: customer name, contract value, materials status, crew, schedule
- Production dashboard metrics at top
- Links to job detail pages

#### Production Dashboard
**Component:** `app/(dashboard)/production/pipeline/components/ProductionDashboard.tsx`

**Metrics Displayed:**
- Jobs this week
- Jobs behind schedule
- Jobs awaiting materials
- Jobs ready for payment
- Completion rate

#### Job Detail Page
**File:** `app/(dashboard)/production/jobs/[jobId]/page.tsx`  
**Component:** `app/(dashboard)/production/jobs/[jobId]/components/JobDetailView.tsx`

**Tabs:**
1. **Timeline** - Stage change history (`JobStageTimeline.tsx`)
2. **Materials** - Material tracker with add/edit (`JobMaterialsTracker.tsx`)
3. **Schedule** - Crew scheduling (`JobSchedulePanel.tsx`)
4. **Photos** - Photo gallery with upload (`JobPhotosGallery.tsx`)
5. **Tasks** - Production tasks list (`JobTasksList.tsx`)
6. **Notes** - Internal notes (`JobNotesPanel.tsx`)

## 🚀 Setup Instructions

### 1. Database Migration

Run the migration in Supabase SQL Editor:

```bash
# File: supabase/migrations/20250201000000_block31440_job_pipeline_v1.sql
```

Or via CLI:
```bash
supabase db push
```

This creates:
- All 6 tables with RLS policies
- Database triggers for stage changes and task auto-creation
- Helper functions for pipeline queries
- Storage bucket for job photos

### 2. Deploy Edge Function

Deploy the customer notification edge function:

```bash
cd supabase
supabase functions deploy send-job-update
```

### 3. Configure Environment Variables

In Supabase Dashboard → Edge Functions → send-job-update → Settings:

**Required:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

**Optional (for SMS):**
- `VONAGE_SMS_URL` - Vonage SMS webhook URL
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_PHONE_NUMBER` - Twilio phone number

**Optional (for Email):**
- `RESEND_API_KEY` - Resend API key (if using Resend)

**Note:** SMS/Email can also be configured per-team in the `teams` table (`sms_provider`, `sms_credentials`).

### 4. Access the Pipeline

Navigate to: `/production/pipeline`

The pipeline page will:
- Show all jobs organized by stage
- Display production dashboard metrics
- Allow drag-and-drop stage changes
- Automatically send customer notifications on stage changes

## 📋 Usage

### Creating a Job

**Option 1: Via API**
```bash
POST /api/jobs/create
{
  "lead_id": "uuid",
  "contract_value": 15000,
  "insurance": true,
  "notes": "Storm damage claim",
  "stage": "estimate"
}
```

**Option 2: Direct Database Insert**
```sql
INSERT INTO jobs (lead_id, team_id, stage, contract_value, insurance)
VALUES ('lead-uuid', 'team-uuid', 'estimate', 15000, true);
```

### Updating Job Stage

**Via UI:** Drag job card to new stage column

**Via API:**
```bash
POST /api/jobs/update-stage
{
  "job_id": "uuid",
  "stage": "approved",
  "lead_id": "uuid"
}
```

**Direct Database:**
```sql
UPDATE jobs SET stage = 'approved' WHERE id = 'job-uuid';
```

The trigger will automatically:
- Log the stage change in `job_stage_events`
- Send customer notification (SMS + Email)
- Auto-create relevant tasks

### Managing Materials

**Via UI:** Job Detail → Materials tab → Add Material

**Direct Database:**
```sql
INSERT INTO job_materials (job_id, supplier, material_type, ordered_at, eta)
VALUES ('job-uuid', 'ABC Supply', 'Shingles', '2025-01-15', '2025-01-20');
```

### Scheduling Crew

**Via UI:** Job Detail → Schedule tab → Edit

**Direct Database:**
```sql
INSERT INTO job_schedule (job_id, crew_name, start_date, duration_days)
VALUES ('job-uuid', 'Crew A', '2025-01-25', 3);
```

### Uploading Photos

**Via UI:** Job Detail → Photos tab → Upload Photo

Photos are stored in Supabase Storage bucket `job-photos` with path: `{job_id}/{timestamp}.{ext}`

### Managing Tasks

**Auto-Created Tasks:**
- When job moves to `materials` stage → "Order materials" task
- When job moves to `scheduled` stage → "Confirm material delivery" + "Call homeowner about schedule" tasks
- When job moves to `completed` stage → "Collect final payment" task

**Manual Tasks:**
- Via UI: Job Detail → Tasks tab → Add Task

## 🎨 Customer Messages

When a job stage changes, customers automatically receive:

**SMS Example:**
> "Your roofing materials have been ordered."

**Email Example:**
> Subject: Materials Ordered for Your Roofing Project
> 
> Hello [Customer Name],
> 
> Your roofing materials have been ordered. We'll notify you once they arrive and are ready for installation.
> 
> Best regards,
> SmartSend Team

**Stage Messages:**
- `estimate`: "We have sent your estimate. Let us know if you have questions!"
- `approved`: "Your roofing project has been approved. We will begin scheduling."
- `insurance`: "We are coordinating with your insurance provider."
- `materials`: "Your roofing materials have been ordered."
- `scheduled`: "Your roof installation is scheduled. We'll send you the exact time soon."
- `in_progress`: "Your roof installation has begun. Our crew is on-site working."
- `completed`: "Your roof project is complete! Thank you for choosing us. Final walkthrough scheduled."

## 📊 Production Dashboard Metrics

The dashboard shows:

1. **Jobs This Week** - Count of jobs created this week
2. **Jobs Behind Schedule** - Jobs with start_date < today but not completed
3. **Jobs Awaiting Materials** - Jobs with undelivered materials
4. **Jobs Ready for Payment** - Completed jobs with unpaid "Collect final payment" task
5. **Completion Rate** - Percentage of jobs in "completed" stage

## 🔒 Security

- **Row Level Security (RLS)** enabled on all tables
- Team-based access control (users can only see jobs in their teams)
- Storage bucket policies restrict photo access to team members
- All API routes verify team membership

## 🧪 Testing

1. **Create a job:**
   ```bash
   curl -X POST http://localhost:3000/api/jobs/create \
     -H "Content-Type: application/json" \
     -d '{"lead_id": "your-lead-id", "contract_value": 15000}'
   ```

2. **Update stage:**
   - Drag job card in UI, or
   - Call `/api/jobs/update-stage` API

3. **Verify notifications:**
   - Check SMS/Email sent to customer
   - Check `job_stage_events` table for logged event
   - Check `job_tasks` table for auto-created tasks

## 📝 Notes

- Jobs are scoped to teams (via `team_id`)
- All components use Supabase client directly (no separate API routes needed for CRUD due to RLS)
- Photos require Supabase Storage bucket `job-photos` to be created (done in migration)
- Customer notifications are sent asynchronously and won't block job updates
- Tasks are auto-created but can be manually added/edited/deleted

## 🎯 Impact

This feature:
- ✅ Keeps jobs moving → faster installs → faster payments
- ✅ Homeowners feel taken care of → more referrals
- ✅ Eliminates chaos and forgetting things
- ✅ Contractor always knows what job is stuck and why
- ✅ Roofers stay organized during storms

**ROOFERS WILL FEEL LIKE SMARTSEND JUST BECAME THEIR PROJECT MANAGER.**
