# Block 13900 — SmartSend Smart Tasks v2 Implementation

## Overview

Smart Tasks v2 is an intelligent task management system that automatically creates follow-up reminders based on lead score, intent detection, and message content. This system removes the burden of manual follow-up tracking from roofers.

## Implementation Summary

### ✅ Database Schema (Migration: `20250130000002_block_13900_smart_tasks_v2.sql`)

1. **Enhanced Tasks Table**
   - Added `priority` field: `low`, `medium`, `high` (with emoji indicators: 🟦, ⚠️, 🔥)
   - Added `type` field: `call`, `text`, `email`, `inspection`, `follow_up`, `send_estimate`, `re_engage`, `answer_question`, `review_damage`, `insurance_support`
   - Added `status` field: `open`, `completed` (synced with `completed` boolean)
   - Added `due_date` field (date component for easier queries)
   - Added `lead_id`, `user_id`, `workspace_id` references
   - Added `metadata` jsonb field for task-specific data

2. **Task Events Table**
   - Tracks all task lifecycle events: `created`, `updated`, `completed`, `reopened`, `priority_changed`, `due_date_changed`, `assigned`, `unassigned`
   - Enables audit trail and analytics

3. **Indexes & Performance**
   - Optimized indexes for priority, status, due_date, lead_id, workspace_id
   - Composite indexes for common query patterns

### ✅ Auto-Creation Triggers (9 Scenarios)

1. **HOT Lead (Score ≥ 70)**
   - Task: "CALL THIS LEAD ASAP — HOT"
   - Priority: 🔥 High
   - Due: Today

2. **Follow-Up Intent**
   - Task: "Follow up with {{name}} — asked a question."
   - Priority: ⚠️ Medium
   - Due: Tomorrow

3. **Direct Questions**
   - Task: "Answer homeowner's question: {{snippet}}"
   - Priority: 🔥 High
   - Due: Same Day
   - Detects question patterns: "what's the price", "how much", "can you come", etc.

4. **Repair Signals**
   - Task: "Repair interest — send quick inspection offer"
   - Priority: 🔥 High
   - Due: Today
   - Detects keywords: leak, missing shingle, flashing, repair, fix, damage

5. **Insurance Keywords**
   - Task: "Insurance job opportunity — respond quickly"
   - Priority: 🔥 High
   - Due: Same Day
   - Detects keywords: adjuster, claim, covered, insurance

6. **Storm Risk**
   - Task: "Storm-affected homeowner — follow up with inspection offer"
   - Priority: 🔥 High
   - Due: Within 24 hours

7. **No Reply After X Days**
   - Task: "No response — follow up"
   - Priority: ⚠️ Medium
   - Due: Based on campaign settings

8. **Past Quote Detected**
   - Task: "Reconnect on past quote"
   - Priority: ⚠️ Medium
   - Due: This Week

9. **High Estimated Value**
   - Task: "High-value job — get estimate booked"
   - Priority: 🔥 High
   - Due: Today
   - Triggered when lead score >= 80 AND has replacement signals

### ✅ Auto-Completion Logic

Tasks are automatically completed when:
- Roofer sends a reply (outbound message exists)
- Lead score drops below 50 (no longer hot)
- Lead status becomes HOT/WARM (task served its purpose)
- Insurance job resolved (score >= 90)

### ✅ Worker Jobs

1. **Nightly Priority Refresh** (`nightly_task_priority_refresh`)
   - Updates task priorities based on current lead scores
   - Adjusts due dates for overdue high-priority tasks

2. **Task Cleanup** (`cleanup_old_tasks`)
   - Removes completed tasks older than 90 days

### ✅ API Endpoints

1. **GET /api/tasks**
   - Query params: `status`, `assignedTo`, `dateRange`, `priority`, `contactId`, `leadId`, `campaignId`, `type`, `due`
   - Returns grouped tasks: `overdue`, `today`, `tomorrow`, `thisWeek`, `later`

2. **POST /api/tasks**
   - Creates new task
   - Supports all Smart Tasks v2 fields

3. **PATCH /api/tasks/[id]**
   - Updates task (priority, status, due date, assignment, etc.)
   - Auto-logs events to `task_events` table

4. **DELETE /api/tasks/[id]**
   - Deletes task

5. **GET /api/tasks/stats**
   - Returns dashboard statistics:
     - Hot leads needing action
     - Insurance leads
     - Storm leads
     - Overdue tasks
     - Today/tomorrow/this week counts

### ✅ UI Components

1. **Task Sidebar** (`components/inbox/v2/TaskSidebar.tsx`)
   - Shows tasks for selected thread/lead in inbox
   - Displays priority badges, due dates, task types
   - Quick complete action
   - Integrated into inbox-v2 page

2. **Global Task Board** (`app/(app)/tasks/page.tsx`)
   - Drag & drop board with columns:
     - Overdue (red)
     - Today (orange)
     - Tomorrow (yellow)
     - This Week (blue)
     - Later (gray)
   - Filter by priority (All, High, Medium, Low)
   - Task cards with icons, priority badges, due dates

3. **Dashboard Cards** (`components/dashboard/TaskStatsCards.tsx`)
   - Top banner cards showing:
     - HOT Leads Needing Action (5)
     - Insurance Leads (2)
     - Storm Leads (7)
     - Overdue Tasks (3)
   - Clickable cards linking to filtered task views
   - Auto-refreshes every 60 seconds

## Key Features

### 🔥 Priority Levels
- **High Priority (🔥)**: HOT leads, insurance, storms, big replacements, urgent questions
- **Medium Priority (⚠️)**: Follow-up requested, warm leads, repair interest
- **Low Priority (🟦)**: General follow-up, administrative, cold leads

### 📋 Task Types
- Call, Text, Email, Inspection, Follow-Up, Send Estimate, Re-Engage, Answer Question, Review Damage, Insurance Support

### ⏰ Smart Deadlines
Deadlines adapt to:
- Lead score
- Urgency keywords
- Roofer working hours
- Storm urgency level

Examples:
- HOT → Due Today
- Warm → Due in 2 Days
- Insurance job → Due in 1 Day
- Repair → Due Today

## Where Tasks Show

1. **Right Sidebar in Inbox** (`/inbox-v2`)
   - Every lead shows tasks
   - "CALL TODAY — HOT"
   - "Follow up tomorrow"
   - "Answer question: price?"

2. **Global Task Board** (`/tasks`)
   - Columns: Today, Tomorrow, This Week, Later
   - Drag & drop (future enhancement)
   - Contractor-proof interface

3. **Dashboard Cards** (Dashboard page)
   - Top banners:
     - HOT Leads Needing Action
     - Insurance Leads
     - Storm Leads
     - Overdue Tasks

## Technical Architecture

### Functions
- `auto_create_smart_task_v2()` - Main function for auto-creating tasks
- `trigger_task_on_hot_lead()` - Trigger for HOT lead detection
- `trigger_task_on_follow_up_intent()` - Trigger for FOLLOW_UP intent
- `detect_and_create_question_tasks()` - Detects direct questions
- `detect_and_create_repair_tasks()` - Detects repair signals
- `detect_and_create_insurance_tasks()` - Detects insurance keywords
- `auto_complete_tasks()` - Auto-completes tasks when conditions met
- `nightly_task_priority_refresh()` - Nightly priority refresh
- `cleanup_old_tasks()` - Cleanup old completed tasks

### Triggers
- `trg_task_on_hot_lead` - Fires when lead score >= 70
- `trg_task_on_follow_up_intent` - Fires when intent = FOLLOW_UP
- `trg_sync_task_fields` - Syncs status and due_date
- `trg_log_task_event` - Logs task events

## Why Roofers Will Love Smart Tasks v2

1. **No more forgotten leads** - SmartSend remembers everything
2. **Automatic reminders = more booked jobs** - Increases revenue
3. **Acts like an office manager** - Feels supported, not overwhelmed
4. **HOT/insurance/storm leads get top priority** - Focus on BIG money
5. **Makes SmartSend feel intelligent and alive** - Thinks for them, not just automates

## Next Steps

1. Set up cron jobs for nightly workers:
   - `nightly_task_priority_refresh()` - Run daily at 2 AM
   - `cleanup_old_tasks()` - Run weekly
   - `detect_and_create_question_tasks()` - Run hourly
   - `detect_and_create_repair_tasks()` - Run hourly
   - `detect_and_create_insurance_tasks()` - Run hourly
   - `auto_complete_tasks()` - Run every 15 minutes

2. Add drag & drop functionality to Task Board (using react-beautiful-dnd or dnd-kit)

3. Add task assignment UI (assign to team members)

4. Add task notifications (email/SMS reminders)

5. Add task templates for common scenarios

6. Add task analytics/reporting

## Files Created/Modified

### Database
- `supabase/migrations/20250130000002_block_13900_smart_tasks_v2.sql`

### API
- `src/app/api/tasks/route.ts` (updated)
- `src/app/api/tasks/[id]/route.ts` (updated)
- `src/app/api/tasks/stats/route.ts` (new)

### UI Components
- `components/inbox/v2/TaskSidebar.tsx` (new)
- `app/(app)/tasks/page.tsx` (new)
- `components/dashboard/TaskStatsCards.tsx` (new)
- `app/(app)/inbox-v2/page.tsx` (updated)

## Testing Checklist

- [ ] Test HOT lead trigger (score >= 70)
- [ ] Test FOLLOW_UP intent trigger
- [ ] Test direct question detection
- [ ] Test repair signal detection
- [ ] Test insurance keyword detection
- [ ] Test auto-completion when reply sent
- [ ] Test auto-completion when score drops
- [ ] Test task sidebar in inbox
- [ ] Test task board page
- [ ] Test dashboard cards
- [ ] Test API endpoints
- [ ] Test RLS policies
- [ ] Test nightly workers





















































