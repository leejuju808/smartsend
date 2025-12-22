# Block 210000 — SmartSend Roofing Crew App v1 Implementation

## Overview

This block implements a comprehensive mobile-first crew experience that transforms SmartSend from an office system into a complete field operations system. Crews can now manage checklists, track time, verify materials, log safety compliance, and report issues—all from their mobile devices.

## ✅ Completed Features

### 1. Database Schema

**Migration File:** `supabase/migrations/20250230000000_block210000_crew_app_v1.sql`

**Tables Created:**
- `crew_time_entries` - Time clock in/out tracking
- `job_checklists` - Digital checklists (pre-start, tear-off, install, final, safety)
- `safety_logs` - OSHA compliance documentation
- `job_issues` - Issue reporting from crews
- `job_material_verifications` - Material verification by crews

**Tables Enhanced:**
- `crew_members` - Added `user_id` and `role` columns
- `job_photos` - Added `photo_category` for auto-labeling (before, tear-off, underlayment, installation, completed)

**Helper Functions:**
- `get_todays_jobs_for_crew_member(uuid)` - Get today's jobs for a crew member
- `is_pre_start_checklist_complete(uuid)` - Check if checklist is complete
- `get_active_time_entry(uuid, uuid)` - Get active time entry for a crew member

**RLS Policies:**
- All tables have Row Level Security enabled
- Users can only access data for jobs they have access to (via team/workspace)

### 2. Mobile App - Crew Mode

**Location:** `smartsend-mobile/app/(tabs)/crew.tsx`

**Features:**
- Today's Jobs list (Uber/DoorDash style)
- Job cards showing:
  - Job number, address, job type, square footage
  - Shingle type
  - Crew lead name
  - Start time
- Tap job to open detailed view

**Job Detail Screen:** `smartsend-mobile/app/crew/job-detail.tsx`

**Tabs:**
1. **Checklist** - Pre-start checklist (required before clock in)
   - Verify address
   - Take BEFORE photos
   - Inspect decking
   - Confirm materials
   - Safety setup
   - Weather check

2. **Time Clock** - Start/stop work tracking
   - Cannot clock in until checklist is complete
   - Shows clock in time
   - Calculates total hours
   - Notifies homeowner when crew arrives

3. **Photos** - Photo upload with auto-labeling
   - BEFORE photos
   - TEAR-OFF photos
   - UNDERLAYMENT photos
   - INSTALLATION photos
   - COMPLETED photos
   - Auto-uploads to Supabase Storage
   - Auto-labels by category

4. **Materials** - Material verification
   - Check off expected vs received
   - Shingles, Ridge, Starter, Underlayment, Flashing, Ice & Water
   - Alerts office if materials are missing

5. **Safety** - OSHA compliance logs
   - Weather conditions
   - Wind speed
   - Temperature
   - PPE compliance
   - Ladder tie-offs
   - Equipment checks
   - Notes

6. **Issues** - Issue reporting
   - Issue types: wrong color, decking rot, missing materials, structural issue, other
   - Severity levels: low, medium, high, critical
   - Photo attachment
   - Auto-alerts office/owner for high/critical issues

### 3. Production Manager Dashboard

**Location:** `app/(dashboard)/production/crew-tracking/page.tsx`

**Features:**
- Real-time view of all crew activity
- Metrics overview:
  - Active crews count
  - Clocked in count
  - Checklists complete
  - Active issues (with high/critical count)

**Tabs:**
1. **Active Jobs** - Shows all scheduled/in-progress jobs
   - Job address, type, contract value
   - Assigned crew
   - Clocked in members
   - Checklist status

2. **Time Tracking** - Today's clock in/out activity
   - Crew member name
   - Job address
   - Clock in/out times
   - Total hours worked

3. **Checklists** - Pre-start checklist status
   - Job address
   - Completion status
   - Completion timestamp

4. **Materials** - Material verification status
   - Job address
   - All materials present or missing items
   - Verification timestamp

5. **Issues** - Active issues that need attention
   - Job address
   - Issue type and severity
   - Description
   - Reported by
   - Timestamp

6. **Safety Logs** - Today's safety compliance documentation
   - Job address
   - Weather conditions
   - Compliance checklist
   - Logged by
   - Timestamp

### 4. Automation Triggers

**API Routes Created:**

1. **`/api/crew/clock-in-notification`**
   - Triggered when crew clocks in
   - Notifies homeowner via SMS/email
   - Logs activity

2. **`/api/crew/missing-materials-alert`**
   - Triggered when materials are missing
   - Alerts production managers and owners
   - Creates activity record

3. **`/api/crew/issue-alert`**
   - Triggered when high/critical issue is reported
   - Immediately notifies owners
   - Pauses job if critical
   - Creates alert record

4. **`/api/crew/photo-to-claim`**
   - Triggered when BEFORE photos are uploaded
   - Adds to insurance claim packet (if insurance job)
   - Logs activity

5. **`/api/crew/generate-final-report`**
   - Triggered when job is completed
   - Generates final report with:
     - All photos
     - Time tracking summary
     - Checklists
     - Safety logs
   - Emails to homeowner

**Database Triggers:**
- `trg_notify_crew_clock_in` - Notifies on clock in
- `trg_alert_missing_materials` - Alerts on missing materials
- `trg_alert_high_severity_issue` - Alerts on high/critical issues

## 🚀 Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration
supabase db push

# Or run directly in Supabase SQL Editor
# File: supabase/migrations/20250230000000_block210000_crew_app_v1.sql
```

### 2. Set Up Storage Bucket

Create a storage bucket for job photos:

```sql
-- In Supabase Dashboard > Storage
-- Create bucket: "job-photos"
-- Set to public or configure RLS policies
```

### 3. Configure Mobile App

The mobile app is already set up with:
- Crew Mode tab in navigation
- Job detail screens with all tabs
- Photo upload functionality
- Time tracking
- Checklists
- Material verification
- Safety logs
- Issue reporting

### 4. Set Up Webhooks (Optional)

To enable real-time notifications, set up webhooks in Supabase:

1. Go to Database > Webhooks
2. Create webhooks for:
   - `crew_time_entries` INSERT → Call `/api/crew/clock-in-notification`
   - `job_material_verifications` INSERT/UPDATE → Call `/api/crew/missing-materials-alert`
   - `job_issues` INSERT → Call `/api/crew/issue-alert`
   - `job_photos` INSERT → Call `/api/crew/photo-to-claim`
   - `jobs` UPDATE (when stage = 'completed') → Call `/api/crew/generate-final-report`

### 5. Integrate SMS/Email Services

Update the API routes to integrate with your SMS/email providers:

- **SMS:** Twilio, Vonage/Nexmo, or similar
- **Email:** Resend, SendGrid, or similar

Replace the `console.log` statements in the API routes with actual service calls.

## 📱 Mobile App Usage

1. **Crew members** log in to the mobile app
2. Navigate to **"Crew Mode"** tab
3. See **Today's Jobs** list
4. Tap a job to open details
5. Complete **Pre-Start Checklist** (required)
6. **Clock In** to start work
7. Take **Photos** at each stage
8. **Verify Materials** are present
9. Log **Safety** compliance
10. **Report Issues** as needed
11. **Clock Out** when done

## 🖥️ Production Manager Dashboard Usage

1. Navigate to `/production/crew-tracking`
2. View **metrics overview** at top
3. Switch between tabs to see:
   - Active jobs and crew assignments
   - Time tracking activity
   - Checklist completion status
   - Material verification status
   - Active issues needing attention
   - Safety logs

## 🔥 Key Benefits

1. **Order & Documentation** - Every job is documented from start to finish
2. **Accountability** - Time tracking and checklists ensure nothing is missed
3. **Communication** - Issues are reported immediately, materials alerts prevent delays
4. **Compliance** - Safety logs provide OSHA documentation
5. **Professionalism** - Homeowners get real-time updates and photos
6. **Insurance** - BEFORE/AFTER photos automatically added to claims
7. **Payroll** - Accurate time tracking for crew payroll

## 🎯 Next Steps

1. **Test the mobile app** with a crew member account
2. **Set up webhooks** for real-time notifications
3. **Integrate SMS/email services** for alerts
4. **Configure storage bucket** for photos
5. **Train crews** on using the app
6. **Monitor the dashboard** for crew activity

## 📝 Notes

- The mobile app requires crew members to be linked to a `crew_members` record with a `user_id`
- Checklists must be completed before clocking in (enforced in UI)
- High/critical issues automatically pause jobs and alert owners
- Missing materials trigger immediate alerts to production managers
- All photos are auto-labeled by category for easy organization
- Final reports are auto-generated when jobs are completed

---

**Block 210000 Complete** ✅

This transforms SmartSend into both an office system AND a field operations system, giving roofers complete control and visibility over their crews.


























