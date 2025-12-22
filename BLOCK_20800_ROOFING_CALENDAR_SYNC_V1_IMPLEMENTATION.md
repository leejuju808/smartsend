# Block 20800 — SmartSend Roofing Calendar Sync v1 Implementation

## 🎯 Mission

This block is CRITICAL. Right now, SmartSend knows when adjusters are scheduled, when claims are approved, when homeowners reply, when proposals go out, when leads become install-ready, and when jobs are scheduled in CRM stages. But roofers forget to schedule, remind, and follow up.

**Block 20800 turns SmartSend into a scheduling assistant that syncs your job pipeline with a clean, simple calendar view.**

---

## ✅ Implementation Complete

### 1. Database Migration ✅

**File:** `supabase/migrations/20250201000006_block20800_roofing_calendar_sync_v1.sql`

#### Core Table: `calendar_events`

**Columns:**
- `id` - UUID primary key
- `job_id` - Links to roofing_jobs
- `thread_id` - Links to inbox_threads
- `lead_id` - Links to leads
- `contact_id` - Links to contacts
- `workspace_id` - Workspace context
- `event_type` - ADJUSTER_APPT, INSTALL_DATE, FOLLOW_UP, INSPECTION, TASK
- `title` - Event title
- `description` - Event description
- `event_date` - Date of event
- `event_start_time` - Start time (optional)
- `event_end_time` - End time (optional)
- `status` - scheduled, completed, cancelled, rescheduled
- `created_by` - 'AI' or 'user'
- `created_by_user_id` - User ID if manually created
- `metadata` - JSONB with claim_number, carrier, job_value, homeowner_name, etc.

**Indexes:**
- Date range queries
- Event type filtering
- Workspace filtering
- Upcoming events queries

**RLS Policies:**
- Users can view/create/update/delete events for their workspace

### 2. Auto-Creation Triggers ✅

#### A) Adjuster Visits (Block 20360)
**Trigger:** `trg_create_adjuster_appointment_event`
- Fires when `insurance_claim_status` changes to `adjuster_visit_scheduled`
- Extracts date/time from email body (regex patterns)
- Creates `ADJUSTER_APPT` event
- Includes claim number, carrier, homeowner name, job value in metadata

#### B) Install-Ready Follow-Up (Block 20400)
**Trigger:** `trg_create_install_ready_followup_event`
- Fires when `insurance_install_ready` becomes `true`
- Creates `FOLLOW_UP` event for today
- Title: "Call Homeowner to Schedule Install — $X Job"
- Includes job value and homeowner name

#### C) Proposal Follow-Up (Block 20560)
**Trigger:** `trg_create_proposal_followup_event`
- Fires when proposal status changes to `sent`
- Creates `FOLLOW_UP` event for tomorrow
- Auto-completes when homeowner replies (via `trg_auto_complete_proposal_followup`)

#### D) Adjuster Follow-Ups (Unresponsive) (Block 20590)
**Function:** `check_and_create_adjuster_followup_events()`
- Checks for adjusters who haven't replied in 48+ hours
- Creates `FOLLOW_UP` events
- Should be called by cron job hourly

#### E) Missed Homeowner Follow-Up (Block 20770)
**Function:** `check_and_create_homeowner_followup_events()`
- Checks for homeowner replies unanswered for >12 hours
- Creates high-priority `FOLLOW_UP` events
- Should be called by cron job hourly

### 3. CRM Stage Integration (Block 20620) ✅

#### Install Date → Stage Update
**Trigger:** `trg_update_job_stage_on_install_date`
- When `INSTALL_DATE` event is created/updated
- Auto-updates job stage to `SCHEDULED_INSTALL`
- Creates timeline event

#### Past Install Dates → Stage Update
**Function:** `check_and_update_stages_for_past_events()`
- Checks for past `INSTALL_DATE` events
- Moves job stage from `SCHEDULED_INSTALL` → `IN_PROGRESS`
- Marks event as completed
- Should be called by cron job daily

### 4. Notification Hooks (Block 20770) ✅

**Trigger:** `trg_create_calendar_event_notifications`
- **1 hour before adjuster appointment** → notification
- **Day of install** → notification
- **Missed follow-up** (past due date) → notification
- Creates notifications for workspace owners/admins

### 5. API Endpoints ✅

#### GET /api/calendar/events (Extended)
**File:** `app/api/calendar/events/route.ts`
- Extended to include roofing calendar events
- Supports filtering by event types: `adjuster_appt`, `install_date`, `follow_up`
- Returns enriched events with claim number, carrier, job value

#### POST /api/calendar/roofing-events
**File:** `app/api/calendar/roofing-events/route.ts`
- Creates new roofing calendar event
- Validates event_type, title, event_date
- Uses `create_calendar_event()` database function

#### PATCH /api/calendar/roofing-events/[id]
**File:** `app/api/calendar/roofing-events/[id]/route.ts`
- Updates calendar event (title, date, time, status, metadata)
- Validates workspace access

#### DELETE /api/calendar/roofing-events/[id]
**File:** `app/api/calendar/roofing-events/[id]/route.ts`
- Deletes calendar event
- Validates workspace access

### 6. Calendar UI Updates ✅

**File:** `app/(dashboard)/calendar/page.tsx`

#### New Features:
- **Event Type Filters:**
  - ☑ Adjuster Appts (purple)
  - ☑ Install Dates (green)
  - ☑ Follow-Ups (orange)
  - ☑ Inspections (blue)
  - ☑ Tasks (yellow)

- **Color Coding:**
  - Purple → Adjuster Appointments
  - Green → Install Dates
  - Orange → Follow-Ups
  - Blue → Inspections
  - Yellow → Tasks

- **Event Details Panel:**
  - Shows claim number
  - Shows carrier
  - Shows job value
  - Shows description
  - Links to thread/job/contact

### 7. Cron Job Function ✅

**File:** `supabase/functions/calendar-followup-checks/index.ts`

**Schedule:** Every hour (configured in `supabase/config.toml`)

**Functionality:**
1. Checks for unresponsive adjusters (48+ hours)
2. Checks for missed homeowner follow-ups (>12 hours)
3. Checks for past install dates and updates stages

**Configuration:**
```toml
[cron.jobs."calendar-followup-checks"]
schedule = "0 * * * *"   # every hour
endpoint = "/functions/v1/calendar-followup-checks"
```

### 8. Database Helper Functions ✅

#### `create_calendar_event()`
- Creates calendar event with automatic workspace detection
- Handles all event types
- Validates required fields

#### `get_calendar_events()`
- Gets calendar events for date range
- Enriches with homeowner name, claim number, job value, carrier
- Supports filtering by event types and status

---

## 🧠 How Block 20800 Helps Roofing Companies

### Problems Solved:

1. **Roofers forget adjuster visits** → Auto-creates calendar events when adjuster visit is scheduled
2. **Roofers forget proposal follow-ups** → Auto-creates follow-up events when proposals are sent
3. **Roofers forget to call install-ready leads** → Auto-creates follow-up events when install-ready is triggered
4. **Roofers forget to follow up with unresponsive adjusters** → Cron job creates follow-up events for adjusters who haven't replied in 48+ hours
5. **Roofers forget to reply to homeowners** → Cron job creates follow-up events for unanswered homeowner replies (>12 hours)
6. **Roofers forget to schedule installs** → Manual install date picker creates `INSTALL_DATE` events and auto-updates CRM stage
7. **Roofers forget to check calendar** → Notifications for upcoming events (1 hour before adjuster appt, day of install, missed follow-ups)

### Value Proposition:

**"My office manager + sales coordinator + insurance assistant + scheduler — all in one."**

This makes SmartSend indispensable to roofing companies by:
- ✅ Automatic scheduling events
- ✅ Automatic follow-up reminders
- ✅ Automatic adjuster reminders
- ✅ Install-ready triggers
- ✅ Pipeline stage → calendar syncing
- ✅ Calendar view for the whole business

---

## 📋 Usage Examples

### 1. Adjuster Appointment Auto-Created

When Insurance Brain (Block 20360) detects adjuster visit scheduled:
```sql
-- Trigger fires automatically
-- Creates calendar event:
{
  "event_type": "ADJUSTER_APPT",
  "title": "Adjuster Visit — Claim #SF-314444",
  "event_date": "2025-08-22",
  "metadata": {
    "claim_number": "SF-314444",
    "carrier": "State Farm",
    "homeowner_name": "Sarah Thompson",
    "job_value": 22680
  }
}
```

### 2. Install-Ready Follow-Up Auto-Created

When install-ready is triggered (Block 20400):
```sql
-- Trigger fires automatically
-- Creates calendar event:
{
  "event_type": "FOLLOW_UP",
  "title": "Call Homeowner to Schedule Install — $22,680 Job",
  "event_date": "2025-01-30", -- today
  "metadata": {
    "action": "call_to_schedule",
    "stage": "INSTALL_READY"
  }
}
```

### 3. Manual Install Date Creation

Roofer picks install date:
```typescript
POST /api/calendar/roofing-events
{
  "event_type": "INSTALL_DATE",
  "title": "Install Date — Sarah Thompson",
  "event_date": "2025-08-30",
  "event_start_time": "08:00",
  "job_id": "...",
  "thread_id": "..."
}

// Auto-updates job stage to SCHEDULED_INSTALL
```

### 4. Cron Job Checks (Hourly)

```typescript
// Calls edge function: calendar-followup-checks
// 1. Checks for unresponsive adjusters → creates FOLLOW_UP events
// 2. Checks for missed homeowner replies → creates FOLLOW_UP events
// 3. Checks for past install dates → updates stages to IN_PROGRESS
```

---

## 🔄 Integration Points

### With Other Blocks:

- **Block 20360 (Insurance Brain)** → Detects adjuster visits, creates events
- **Block 20400 (Install-Ready Playbook)** → Creates follow-up events when install-ready
- **Block 20560 (Proposal Sender)** → Creates follow-up events when proposals sent
- **Block 20590 (Adjuster Engine)** → Checks for unresponsive adjusters
- **Block 20620 (CRM Sync)** → Updates job stages when install dates set
- **Block 20770 (Notification Engine)** → Creates notifications for calendar events

---

## 🚀 Next Steps (v2)

1. **Google Calendar Integration** - Sync calendar_events to Google Calendar
2. **Task Events** - Support TASK event type (v2)
3. **Recurring Events** - Support recurring follow-ups
4. **Event Templates** - Pre-defined event templates for common scenarios
5. **Bulk Actions** - Reschedule multiple events, mark multiple as completed
6. **Calendar Export** - Export calendar to CSV/iCal

---

## 📝 Notes

- MVP = Internal calendar only (no Google Calendar sync yet)
- All events are workspace-scoped (RLS enforced)
- Events can be created by AI (auto) or users (manual)
- Cron job runs hourly to check for follow-ups and update stages
- Notifications are created automatically for important events
















































