# BLOCK 251700 — SmartSend Crew Issue Reporting System v1 Implementation

## ✅ Implementation Complete

**"Material Shortages, Safety Alerts, Damage Reports, Customer Complaints, Approval Workflow"**

This is the system that stops crews from hiding problems, stops jobs from falling apart, and stops roofers from losing thousands because "nobody reported it."

Roofers will literally say:

> "SmartSend fixed our chaos. Now issues get reported instantly — not days later."

This is how SmartSend turns field operations from reactive to proactive.

---

## 📊 Database Schema

### Migration File
`supabase/migrations/20250130000000_block251700_crew_issue_reporting_v1.sql`

### Tables Created

1. **`crew_issues`** - Main issue reporting table
   - Fields: id, job_id, employee_id, issue_type, severity, title, description, photo_url, location_lat, location_lng, reported_at, status, resolved_at, resolved_by
   - Issue types: material, safety, damage, customer, weather, other
   - Severity levels: low, medium, high, critical
   - Status: open, in_progress, resolved, dismissed

2. **`crew_issue_comments`** - Internal communication on issues
   - Fields: id, issue_id, employee_id, user_id, comment, created_at

3. **Storage Bucket: `issue-photos`**
   - Private bucket for storing issue photos
   - 10 MB file size limit
   - Image formats: jpeg, jpg, png, webp, gif, heic, heif

### Views Created

1. **`employee_issue_stats`** - Employee issue statistics for risk assessment
   - Aggregates: total_issues, severe_issues, critical_issues, high_issues, medium_issues, low_issues, last_issue_reported_at

### Functions Created

1. **`calculate_job_risk_score(p_job_id uuid)`** - Calculates risk score for a job
   - Formula: (critical * 20) + (high * 10) + (medium * 5) + (low * 1)
   - Only counts open/in_progress issues

2. **`get_job_risk_level(p_score integer)`** - Returns risk level label
   - Levels: CRITICAL (≥50), HIGH (≥30), MODERATE (≥15), LOW (≥5), NONE (<5)

### Triggers Created

1. **`trigger_update_crew_issues_updated_at`** - Auto-updates updated_at timestamp
2. **`trigger_auto_set_resolved_at`** - Auto-sets resolved_at when status changes to resolved

---

## 🔌 API Routes

### Issue Management

1. **`POST /api/workforce/issues/create`**
   - Creates a new crew issue report
   - Validates issue_type and severity
   - Auto-triggers alerts for high/critical severity issues
   - Location: `app/api/workforce/issues/create/route.ts`

2. **`POST /api/workforce/issues/update-status`**
   - Updates issue status (open, in_progress, resolved, dismissed)
   - Auto-sets resolved_at timestamp
   - Triggers alerts for critical issues
   - Location: `app/api/workforce/issues/update-status/route.ts`

3. **`GET /api/workforce/issues/list`**
   - Lists all issues with filters (status, severity, issue_type, job_id)
   - Includes related job and employee data
   - Location: `app/api/workforce/issues/list/route.ts`

4. **`GET /api/workforce/issues/[id]`**
   - Gets single issue with comments
   - Includes related job and employee data
   - Location: `app/api/workforce/issues/[id]/route.ts`

5. **`POST /api/workforce/issues/[id]/comment`**
   - Adds a comment to an issue
   - Location: `app/api/workforce/issues/[id]/comment/route.ts`

### Risk Scoring

6. **`GET /api/workforce/issues/job-risk/[jobId]`**
   - Gets risk score for a job
   - Returns: score, level, issue_counts
   - Location: `app/api/workforce/issues/job-risk/[jobId]/route.ts`

### Employee Stats

7. **`GET /api/workforce/employees/[id]/issue-stats`**
   - Gets issue statistics for an employee
   - Returns: total_issues, severe_issues, breakdown by severity
   - Location: `app/api/workforce/employees/[id]/issue-stats/route.ts`

---

## 📱 UI Components

### Crew Mobile UI

1. **Issue Reporting Page**
   - Path: `/app/crew/jobs/[jobId]/issue/new/page.tsx`
   - Features:
     - Issue type dropdown (material, safety, damage, customer, weather, other)
     - Severity selection (low, medium, high, critical)
     - Title and description fields
     - Photo upload with preview
     - Auto GPS location capture
     - Submit button with loading state

### Production Manager Dashboard

2. **Issues Dashboard**
   - Path: `/app/workforce/issues/page.tsx`
   - Features:
     - Filterable table (status, severity, type)
     - Color-coded severity badges
     - Sort by severity (critical first)
     - View issue button
     - Real-time issue list

3. **Issue Details Page**
   - Path: `/app/workforce/issues/[id]/page.tsx`
   - Features:
     - Full issue details with photo
     - Location with Google Maps link
     - Comments timeline
     - Add comment form
     - Status dropdown
     - Mark Resolved / Dismiss buttons
     - Related job information

4. **Job Risk Score Component**
   - Path: `/app/(dashboard)/production/jobs/[jobId]/components/JobRiskScore.tsx`
   - Features:
     - Displays risk score and level
     - Shows issue counts by severity
     - Link to view all issues
     - Color-coded risk levels

5. **Employee Risk Flag**
   - Added to: `/src/app/workforce/employees/[id]/page.tsx`
   - Features:
     - Shows issue risk on employee profile
     - Displays total issues and severe issues count
     - Link to view employee's issues
     - Risk level indicator (Low/Moderate)

---

## ⚡ Edge Functions

### Auto-Alert System

1. **`issue-created-alert`**
   - Path: `supabase/functions/issue-created-alert/index.ts`
   - Triggers: When issues are created with high/critical severity
   - Features:
     - Sends Slack alerts (if configured)
     - Sends email alerts (if configured)
     - Includes issue details, job info, employee info
     - Link to view issue in SmartSend

---

## 🎯 Key Features

### ✅ Real-time Issue Reporting
- Crews can submit issues instantly from mobile
- Photo + timestamp + GPS location
- Auto-attached to jobs

### ✅ Office Dashboard for Triage
- Production managers see all issues in one place
- Filter by status, severity, type
- Sort by priority (critical first)

### ✅ Resolution Workflow
- Status tracking: open → in_progress → resolved/dismissed
- Comments for internal communication
- Auto-timestamps for resolution

### ✅ Auto Alerts
- High/critical issues trigger immediate alerts
- Slack and email notifications
- Includes all relevant context

### ✅ Job Risk Scoring
- Each issue impacts job risk score
- Formula: (critical * 20) + (high * 10) + (medium * 5) + (low * 1)
- Displayed on job overview pages
- Risk levels: CRITICAL, HIGH, MODERATE, LOW, NONE

### ✅ Employee Risk Flagging
- Track if workers repeatedly cause issues
- Shows on employee profile
- Breakdown by severity
- Link to view all employee issues

---

## 🚀 Deployment Checklist

### 1. Apply Database Migration
```bash
# Run in Supabase SQL Editor or via migration tool
supabase/migrations/20250130000000_block251700_crew_issue_reporting_v1.sql
```

### 2. Deploy Edge Function
```bash
# Deploy issue-created-alert function
supabase functions deploy issue-created-alert
```

### 3. Configure Environment Variables
- `ALERT_SLACK_ENABLED=true` (optional)
- `SLACK_WEBHOOK_URL=your_webhook_url` (optional)
- `ALERT_EMAIL_ENABLED=true` (optional)
- `OWNER_EMAIL=your_email` (optional)
- `EMAIL_API_URL=your_email_api_url` (optional)

### 4. Test the System
1. Create a test issue from crew mobile UI
2. Verify it appears in production manager dashboard
3. Test status updates
4. Verify alerts are sent (if configured)
5. Check risk scores are calculated correctly

---

## 📁 Files Created

### Database
- `supabase/migrations/20250130000000_block251700_crew_issue_reporting_v1.sql`

### API Routes
- `app/api/workforce/issues/create/route.ts`
- `app/api/workforce/issues/update-status/route.ts`
- `app/api/workforce/issues/list/route.ts`
- `app/api/workforce/issues/[id]/route.ts`
- `app/api/workforce/issues/[id]/comment/route.ts`
- `app/api/workforce/issues/job-risk/[jobId]/route.ts`
- `app/api/workforce/employees/[id]/issue-stats/route.ts`

### UI Components
- `app/crew/jobs/[jobId]/issue/new/page.tsx`
- `app/workforce/issues/page.tsx`
- `app/workforce/issues/[id]/page.tsx`
- `app/(dashboard)/production/jobs/[jobId]/components/JobRiskScore.tsx`

### Edge Functions
- `supabase/functions/issue-created-alert/index.ts`

### Modified Files
- `src/app/workforce/employees/[id]/page.tsx` (added issue risk flag)

---

## 💡 Why This Makes Roofers Feel Stupid Not Using SmartSend

**Before SmartSend:**
- ❌ Zero system for field problems
- ❌ Foremen hide issues
- ❌ Materials missing but reported way too late
- ❌ Safety hazards ignored
- ❌ Leaks caused by unreported damage
- ❌ Customers complaining long after the crew left
- ❌ NO DOCUMENTATION to protect the company

**With SmartSend:**
- ✅ Real-time issue reporting
- ✅ Photo + timestamp + GPS
- ✅ Office dashboard for triage
- ✅ Documentation for insurance/disputes
- ✅ Reduced callbacks
- ✅ Crew accountability
- ✅ Job risk scoring

**Roofers will tell each other:**
> "We would have saved 10 grand this year if we had SmartSend sooner."
> "Anyone STILL not using SmartSend is literally choosing chaos."

This is a POWERHOUSE feature.
























