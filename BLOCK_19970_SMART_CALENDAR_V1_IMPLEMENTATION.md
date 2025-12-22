# Block 19970 — SmartSend Inbox Smart Calendar v1 Implementation

## Overview

This block implements SmartSend's Smart Calendar v1, a roofing-specific scheduling system built directly into the Inbox ecosystem. The calendar provides intelligent scheduling, real-time availability, AI-powered time suggestions, rep assignment, storm day blocking, and comprehensive appointment management.

## Database Schema

### New Tables

1. **appointment_types** - Defines appointment types with icons, colors, and default durations
2. **rep_availability** - Tracks rep availability, workload, and constraints
3. **availability_blocks** - Blocks time slots based on constraints (storms, holidays, breaks, etc.)
4. **smart_time_suggestions** - Stores AI-generated time suggestions
5. **daily_schedule_digests** - Tracks daily schedule digests sent to users

### Enhanced Tables

- **appointments** - Extended with:
  - `appointment_type_id` - Links to appointment types
  - `assigned_rep_id` - Rep assignment
  - `start_time` / `end_time` - Calculated timestamps
  - `timezone` - Timezone support
  - `location_address` / `location_coordinates` - Location data
  - `travel_time_minutes` - Travel time (v2)
  - `storm_related` / `storm_event_id` - Storm tracking
  - `priority` - Priority levels
  - `ai_suggested` / `ai_suggestion_reason` - AI suggestion tracking
  - Confirmation/reminder flags
  - External calendar sync fields

## Key Features Implemented

### ✅ Part 1 — Calendar Tab in Inbox
- Added Calendar tab alongside Threads and Pipeline tabs
- Integrated into existing inbox navigation

### ✅ Part 2 — Appointment Types
- 9 default appointment types:
  - Estimate Appointment (60 min, blue)
  - Inspection (45 min, green)
  - Repair Assessment (30 min, orange)
  - Insurance Meeting (60 min, purple)
  - Storm Check (30 min, red)
  - Follow-Up Visit (30 min, cyan)
  - Job Walkthrough (45 min, indigo)
  - Production Meeting (60 min, pink)
  - Customer Pickup (15 min, teal)
- Each type has icon, color, default duration, and recommended times

### ✅ Part 3 — Real-Time Availability Engine
- `is_time_slot_available()` function checks:
  - Existing appointments
  - Rep availability settings
  - Vacation days
  - Availability blocks (storms, holidays, breaks)
  - Business hours
- `get_available_time_slots()` returns available slots for a date

### ✅ Part 4 — Smart Suggest Times (AI-Powered)
- `generate_smart_time_suggestions()` function analyzes:
  - Job type
  - Severity/urgency
  - Location/ZIP code
  - Storm impact
  - Rep availability
- Generates contextual suggestions:
  - Hot Emergency: "Today between 2-4 PM"
  - Insurance Claim: "Tomorrow morning before adjuster arrives"
  - Storm-related: "Tomorrow morning for inspection"

### ✅ Part 5 — Rep Assignment & Availability
- Rep availability tracking with:
  - Active weekdays
  - Day start/end times
  - Max appointments per day
  - Min time between appointments
  - Lunch breaks
  - Vacation tracking
  - Workload metrics

### ✅ Part 6 — Calendar Views
- Day view - Single day with hourly slots
- 3-Day view - Three consecutive days
- Week view - Full week (7 days)
- Mobile-friendly responsive design

### ✅ Part 7 — Smart Time Blocking for Storm Days
- `block_storm_days()` function automatically:
  - Blocks morning (8 AM - 12 PM) for inspections
  - Blocks afternoon (1 PM - 5 PM) for inspections
  - Links to weather_events table
  - Flags appointments as storm-related

### ✅ Part 8 — Appointment Detail Panel
- Mini CRM card showing:
  - Homeowner name, phone, email
  - Job type and severity
  - Address with map pin
  - Appointment type with color coding
  - Priority and status badges
  - Storm-related indicators
  - Assigned rep
  - Notes
  - Link to thread
  - Edit/delete actions

### ✅ Part 9 — Auto Updates to Pipeline & Tasks
- Triggers automatically:
  - Updates thread pipeline_stage to "estimate_scheduled"
  - Updates CRM job status to "booked"
  - Creates follow-up prep tasks
  - Sets task due date to day before appointment

### ✅ Part 10 — Daily Schedule Digest
- `generate_daily_schedule_digest()` function creates:
  - Today's appointments list
  - Address list
  - Job types and severity
  - Prep tasks
  - Storm alerts
  - Assigned reps
  - Important notes
- Ready for email/push notification delivery

## API Endpoints

### GET /api/inbox/calendar/appointments
- Fetches appointments for calendar view
- Supports date range filtering (start/end)
- Supports rep filtering (rep_id)
- Returns enriched appointment data with contact and rep info

### GET /api/inbox/calendar/reps
- Fetches available reps for assignment
- Returns workspace members with profile info

### POST /api/inbox/calendar/suggest-times
- Generates AI-powered time suggestions
- Accepts thread_id, contact_id, job_type, severity, urgency, location_zip
- Returns array of suggested time slots with confidence scores

## UI Components

### CalendarTab Component
- Main calendar view component
- Supports Day/3-Day/Week views
- Shows appointments in time slots
- Color-coded by appointment type
- Click to view details
- Rep filtering
- Date navigation (prev/next/today)

### AppointmentDetailPanel Component
- Side panel showing full appointment details
- Mini CRM card format
- Contact information
- Address and location
- Job details
- Priority and status badges
- Storm indicators
- Thread link
- Edit/delete actions

## Database Functions

1. **is_time_slot_available()** - Checks if time slot is available
2. **get_available_time_slots()** - Returns available slots for a date
3. **generate_smart_time_suggestions()** - AI-powered time suggestions
4. **block_storm_days()** - Auto-blocks storm days
5. **generate_daily_schedule_digest()** - Creates daily digest
6. **update_appointment_times()** - Calculates start_time/end_time from date+time
7. **update_pipeline_on_appointment_booked()** - Auto-updates pipeline
8. **create_appointment_followup_tasks()** - Auto-creates follow-up tasks

## Next Steps (Future Enhancements)

### Drag-and-Drop Calendar Actions
- Implement drag-to-reschedule
- Drag to assign rep
- Drag to change duration
- Real-time conflict detection

### Mobile Quick Book
- Quick booking from mobile
- One-tap time selection
- Location-based suggestions

### Drive Time Integration (v2)
- Calculate travel time between appointments
- Auto-block travel time
- Route optimization

### Calendar Sync
- Google Calendar sync
- Outlook Calendar sync
- Two-way sync
- External calendar event blocking

### Enhanced AI Suggestions
- Machine learning on booking patterns
- Weather-aware suggestions
- Rep workload balancing
- Customer preference learning

### Daily Schedule Digest Delivery
- Email delivery at 7 AM
- Push notification
- SMS option
- Digest customization

## Migration File

`supabase/migrations/20250130000001_block19970_smart_calendar_v1.sql`

Run this migration to set up the complete Smart Calendar system.

## Testing Checklist

- [ ] Calendar tab appears in Inbox
- [ ] Day/3-Day/Week views work correctly
- [ ] Appointments display with correct colors
- [ ] Appointment detail panel opens on click
- [ ] Rep filtering works
- [ ] Date navigation works
- [ ] API endpoints return correct data
- [ ] Availability engine prevents double-booking
- [ ] Storm day blocking works
- [ ] Pipeline updates on appointment booking
- [ ] Tasks created on appointment booking
- [ ] Smart time suggestions generate correctly

## Notes

- The calendar integrates seamlessly with existing inbox infrastructure
- All appointments sync with contacts, threads, and CRM jobs
- Storm detection automatically blocks appropriate time slots
- AI suggestions improve booking efficiency
- Rep assignment enables team scheduling
- Daily digests help plan perfect days

This implementation provides a solid foundation for roofing-specific scheduling that goes far beyond generic calendar systems.



















































