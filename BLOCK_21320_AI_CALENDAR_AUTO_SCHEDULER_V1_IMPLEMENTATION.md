# Block 21320 — SmartSend AI Calendar Auto-Scheduler v1 Implementation

## ✅ Implementation Complete

This block implements a comprehensive AI-powered calendar auto-scheduler that automatically creates calendar events based on insurance timeline, homeowner behavior, adjuster requests, install-ready signals, supplement needs, follow-up timing, proposal engagement, and lead priorities.

## Overview

SmartSend Auto-Scheduler v1 fixes the scheduling nightmare for roofing companies by automatically generating calendar events for:
- **Homeowner-Facing Events**: Inspections, proposal reviews, install-ready calls, deductible explanations, pre-install walkthroughs, install days, post-install check-ins, review requests
- **Adjuster-Facing Events**: Adjuster meetings, photo submission deadlines, supplement follow-ups, approval follow-ups, payment confirmations, scope review calls
- **Internal Team Events**: Crew assignments, material order checks, dumpster scheduling, crew arrival confirmations, final invoice reminders

## Features Implemented

### 1. Database Schema ✅

**File**: `supabase/migrations/20250202000001_block21320_ai_calendar_auto_scheduler_v1.sql`

#### Extended `calendar_events` Table
- Added `auto_scheduled` boolean flag
- Added `auto_schedule_reason` (AI-generated reason)
- Added `auto_schedule_trigger` (what triggered the scheduling)
- Added `auto_schedule_confidence` (confidence score 0-1)
- Added `assigned_to_user_id` and `assigned_to_role` (team role assignment)
- Added `timing_reason` (why this time was chosen)
- Added `homeowner_behavior_pattern` (JSONB storing behavior data)
- Added conflict detection fields (`conflict_detected`, `conflict_resolved`, `conflict_with_event_ids`)
- Added notification tracking fields (`notification_sent_24h`, `notification_sent_1h`)

#### New Tables
- **`homeowner_behavior_patterns`**: Tracks homeowner response patterns, preferred times, engagement patterns
- **`proposal_views`**: Tracks proposal views to detect hot leads

#### Extended Event Types
Added support for all event types:
- `PROPOSAL_REVIEW_CALL`, `INSTALL_READY_CALL`, `DEDUCTIBLE_EXPLANATION_CALL`
- `PRE_INSTALL_WALKTHROUGH`, `POST_INSTALL_CHECKIN`, `REVIEW_REQUEST_CALL`
- `PHOTO_SUBMISSION_DEADLINE`, `SUPPLEMENT_FOLLOWUP`, `APPROVAL_FOLLOWUP`
- `PAYMENT_CONFIRMATION`, `SCOPE_REVIEW_CALL`
- `CREW_ASSIGNMENT`, `MATERIAL_ORDER_CHECK`, `DUMPSTER_SCHEDULING`
- `CREW_ARRIVAL_CONFIRMATION`, `FINAL_INVOICE_REMINDER`

### 2. Core Auto-Scheduling Functions ✅

#### `get_optimal_event_time(contact_id, event_type, preferred_date)`
Determines optimal event time based on homeowner behavior patterns:
- Analyzes preferred reply hours and days
- Considers call preferences (morning/afternoon/evening)
- Falls back to intelligent defaults based on event type
- Returns timing reason and confidence score

#### `check_calendar_conflicts(workspace_id, event_date, start_time, end_time, assigned_user_id)`
Checks for calendar conflicts:
- Detects overlapping time slots
- Checks for same user assignment conflicts
- Returns conflict details and conflicting event IDs

#### `auto_assign_event_role(event_type)`
Auto-assigns events to appropriate team roles:
- Adjuster-facing events → `OWNER` or `ADJUSTER_HELPER`
- Sales/Homeowner-facing events → `SALES_REP`
- Operational events → `OFFICE_STAFF`
- Install events → `OWNER`

#### `auto_schedule_calendar_event(...)`
Main auto-scheduling function:
- Gets optimal timing from homeowner behavior patterns
- Checks for conflicts and adjusts time if needed
- Auto-assigns to appropriate team role
- Creates calendar event with all metadata
- Handles conflict resolution automatically

### 3. Auto-Schedule Triggers ✅

#### A. Claim Approved → Install-Ready Call
**Trigger**: `trigger_auto_schedule_install_ready_call()`
- Triggers when `insurance_claim_status` changes to `'approved'`
- Schedules install-ready call for next morning at 9 AM
- Includes job value and deductible information

#### B. Adjuster Appointment Detected → Auto-Add to Calendar
**Trigger**: `trigger_auto_schedule_adjuster_appointment()`
- Triggers when adjuster visit is scheduled
- Extracts date/time from email text using regex
- Creates adjuster appointment event with notifications

#### C. Proposal Viewed 2+ Times → Immediate Follow-Up
**Function**: `check_proposal_views_and_schedule()`
- Checks for proposals viewed 2+ times in 30 minutes
- Auto-schedules immediate follow-up (within 1 hour)
- Marks as high priority

#### D. Missing Photos / Adjuster Request → Urgent Reminder
**Trigger**: `trigger_auto_schedule_photo_submission()`
- Triggers on inbound messages containing photo/documentation requests
- Creates urgent photo submission deadline event
- Scheduled for ASAP

#### E. Supplement Opportunity Found → Review Event
**Trigger**: `trigger_auto_schedule_supplement_review()`
- Triggers when underpayment > $3,000 detected
- Schedules supplement review for next business day
- Includes underpayment amount in metadata

#### F. Install Booked → Auto-Schedule Operational Events
**Trigger**: `trigger_auto_schedule_install_operations()`
- Triggers when install date is set
- Auto-schedules 6 operational events:
  1. Crew assignment (3 days before)
  2. Material order check (5 days before)
  3. Dumpster scheduling (2 days before)
  4. Pre-install homeowner call (1 day before)
  5. Post-install callback (1 day after)
  6. Payment request (3 days after)

### 4. Intelligent Timing Logic ✅

#### Homeowner Behavior Pattern Tracking
**Trigger**: `update_homeowner_behavior_pattern()`
- Tracks reply times from inbound messages
- Builds pattern of preferred hours and days
- Calculates most active hour/day
- Updates pattern confidence based on sample size

#### Behavior-Based Scheduling
- Uses homeowner's most active hour for scheduling
- Respects call preferences (morning/afternoon/evening)
- Adjusts to preferred day of week if pattern exists
- Falls back to intelligent defaults per event type

### 5. Conflict Detection & Avoidance ✅

- Checks for overlapping time slots
- Checks for same user assignment conflicts
- Automatically adjusts time if conflict detected (tries next hour, then next day)
- Marks events with conflicts and stores conflicting event IDs
- Allows manual resolution

### 6. Team Role Integration ✅

- Events automatically assigned to appropriate roles:
  - `OWNER`: Adjuster meetings, install dates, supplements
  - `SALES_REP`: Proposal calls, install-ready calls, follow-ups
  - `OFFICE_STAFF`: Crew assignments, material orders, dumpster scheduling
  - `ADJUSTER_HELPER`: Adjuster-facing events
- Notifications sent to users with assigned role
- Calendar filters support role-based filtering

### 7. Auto-Scheduler Worker ✅

**File**: `supabase/functions/auto-scheduler-worker/index.ts`

Periodic checks (should be called via cron):
- Checks for hot proposal views
- Checks for unanswered homeowner replies
- Checks for unresponsive adjusters
- Sends 24-hour notifications for upcoming events
- Sends 1-hour notifications for imminent events

### 8. Calendar UI Updates ✅

**File**: `app/(dashboard)/calendar/page.tsx`

#### Visual Indicators
- Auto-scheduled events show sparkle icon (✨)
- Purple ring around auto-scheduled events
- "Auto-Scheduled" badge in event details

#### Event Details Popover
- Shows AI reason for scheduling
- Shows timing reason (why this time was chosen)
- Shows assigned role
- Shows conflict status if detected
- Displays in purple-highlighted section

#### API Updates
**File**: `app/api/calendar/events/route.ts`
- Returns auto-scheduling metadata in calendar events
- Includes `autoScheduled`, `autoScheduleReason`, `timingReason`, `assignedToRole`, `conflictDetected`

### 9. Notification Integration ✅

**Trigger**: `create_auto_scheduled_event_notifications()`
- Creates notifications when events are auto-scheduled
- Sends to users with assigned role
- Includes event details and AI reason
- Sends 24-hour and 1-hour reminders

### 10. Insurance Timeline Integration ✅

**Trigger**: `trigger_auto_schedule_from_timeline()`
- Auto-schedules events based on insurance timeline stage changes:
  - `adjuster_scheduled` → Adjuster appointment reminder
  - `scope_received` → Scope review call
  - `supplement_review` → Supplement follow-up
  - `approved` → Payment confirmation
  - `ready_to_schedule` → Proposal review call

### 11. Follow-Up Brain Integration ✅

**Trigger**: `trigger_auto_schedule_from_followup_brain()`
- Auto-schedules events when follow-up brain detects hot/warm leads
- Hot leads → immediate follow-up (same day)
- Warm leads → follow-up next day
- Uses homeowner behavior patterns for timing

## Usage Examples

### Example 1: Claim Approved
When a claim is approved:
1. Auto-schedules install-ready call for next morning at 9 AM
2. Includes job value and deductible in description
3. Assigned to `SALES_REP` role
4. Notification sent to sales rep
5. Uses homeowner behavior pattern if available

### Example 2: Proposal Viewed 3 Times
When homeowner views proposal 3 times in 30 minutes:
1. Auto-schedules immediate follow-up (within 1 hour)
2. Marked as high priority
3. Assigned to `SALES_REP` role
4. Notification sent immediately
5. Uses homeowner's preferred time if pattern exists

### Example 3: Install Date Set
When install date is confirmed:
1. Auto-schedules 6 operational events:
   - Crew assignment (3 days before)
   - Material check (5 days before)
   - Dumpster (2 days before)
   - Pre-install call (1 day before)
   - Post-install callback (1 day after)
   - Payment request (3 days after)
2. Each event assigned to appropriate role
3. Uses homeowner behavior for homeowner-facing events

## Calendar UI Features

### Event Display
- Auto-scheduled events show sparkle icon
- Purple ring indicates auto-scheduled
- Event details show AI reason and timing explanation

### Filters
- Filter by event type (inspections, tasks, adjuster appts, install dates, follow-ups)
- Filter by assigned to (all, me, specific user)
- View by month/week/day

### Event Details
- Shows AI scheduling reason
- Shows timing reason
- Shows assigned role
- Shows conflict status
- Quick actions (open contact, open task)

## Database Functions

### Public Functions
- `get_optimal_event_time(contact_id, event_type, preferred_date)` - Get optimal timing
- `check_calendar_conflicts(...)` - Check for conflicts
- `auto_assign_event_role(event_type)` - Get assigned role
- `auto_schedule_calendar_event(...)` - Main auto-scheduling function
- `check_proposal_views_and_schedule()` - Check hot proposal views

### Triggers
- `trigger_auto_schedule_install_ready_call()` - Claim approved
- `trigger_auto_schedule_adjuster_appointment()` - Adjuster appointment detected
- `trigger_auto_schedule_photo_submission()` - Photo request
- `trigger_auto_schedule_supplement_review()` - Supplement opportunity
- `trigger_auto_schedule_install_operations()` - Install booked
- `update_homeowner_behavior_pattern()` - Track behavior
- `trigger_auto_schedule_from_timeline()` - Insurance timeline integration
- `trigger_auto_schedule_from_followup_brain()` - Follow-up brain integration
- `create_auto_scheduled_event_notifications()` - Notification creation

## Edge Function

### `auto-scheduler-worker`
Runs periodic checks:
- Proposal views (hot leads)
- Unanswered homeowner replies
- Unresponsive adjusters
- 24-hour notifications
- 1-hour notifications

**Recommended Cron Schedule**: Every 15 minutes

## Integration Points

### Insurance Timeline
- Auto-schedules events when timeline stages change
- Integrates with existing timeline triggers

### Follow-Up Brain
- Auto-schedules events when hot/warm leads detected
- Uses follow-up state classification

### Existing Calendar System
- Extends existing `calendar_events` table
- Works with existing calendar UI
- Integrates with existing notification system

## Benefits

1. **No More Forgotten Events**: Auto-schedules all critical events
2. **Smart Timing**: Uses homeowner behavior patterns
3. **Conflict Prevention**: Automatically avoids double-booking
4. **Role-Based Assignment**: Events go to right team members
5. **Proactive Follow-Ups**: Never miss hot leads
6. **Operational Efficiency**: Automates install scheduling workflow
7. **Insurance-Aware**: Integrates with insurance timeline
8. **Behavior-Driven**: Learns from homeowner patterns

## Next Steps

1. Set up cron job for `auto-scheduler-worker` (every 15 minutes)
2. Monitor auto-scheduled events in calendar
3. Review AI reasons and adjust as needed
4. Train team on auto-scheduled events
5. Collect feedback for v2 improvements

## Summary

Block 21320 transforms SmartSend into a true operations engine that automatically manages the entire roofing scheduling workflow. It eliminates scheduling nightmares by:
- Auto-scheduling all critical events
- Using intelligent timing based on homeowner behavior
- Preventing conflicts automatically
- Assigning events to right team members
- Integrating with insurance timeline and follow-up brain
- Providing clear AI reasoning for every event

This is ELITE. This is DIFFERENT. This is MONEY-GENERATING.
















































