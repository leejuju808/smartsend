# Block 16200 — SmartSend Tasks & Follow-Up Board v1

## ✅ Implementation Complete

The Task Engine — the daily operational system that tells roofers exactly WHAT to do, WHO needs attention, and WHEN to follow up — has been successfully implemented.

## 📦 What Was Built

### 1. Database Schema ✅
**Migration**: `supabase/migrations/20250130000001_block_16200_tasks_followup_board_v1.sql`

**Enhancements to Tasks Table:**
- Added `task_type` enum: `follow_up_needed`, `book_inspection`, `answer_question`, `update_lead_info`, `high_urgency_issue`
- Added `urgency` enum: `high` (🔥), `normal` (🟡), `low` (🟦)
- Added `status` enum: `today`, `upcoming`, `waiting_on_homeowner`, `completed`
- Added `workspace_id` for multi-tenant support
- Added `company_id` for company-level tasks
- Added `description`, `metadata` (JSONB), `next_step_suggestion`
- Added `follow_up_cycle_count` and `follow_up_cycle_type` for cycle tracking
- Added `last_message_snippet` for quick reference

**Auto-Generation Functions:**
- `auto_create_task_from_inbox()` - Creates tasks from inbox replies (hot/warm/question)
- `auto_create_task_from_scheduler()` - Creates tasks from appointment bookings/missed appointments
- `auto_create_task_from_pipeline()` - Creates tasks from pipeline movement (HOT stage, stuck leads)
- Database triggers automatically create tasks when:
  - Message intents are created (hot/warm/question)
  - Appointments are booked or missed
  - Pipeline stages change

**Follow-Up Cycle Functions:**
- `update_follow_up_cycles()` - Updates follow-up cycles:
  - Warm leads: every 2 days × 3, then every 4 days × 2, then weekly
  - Cold leads: follow up in 7 days, then stop
  - Old quotes: every 10 days × 3
  - Insurance: follow-up until claim resolved

**Urgency Update Function:**
- `update_task_urgency()` - Updates urgency based on:
  - Storm risk (from metadata)
  - Urgent keywords in messages (leak, water damage, urgent, emergency)
  - Insurance timeline
  - Overdue status

**Helper Functions:**
- `get_today_tasks_count()` - Get count of today's tasks
- `bulk_complete_tasks()` - Bulk complete multiple tasks

### 2. API Routes ✅

**Base Path**: `/api/tasks/v2`

#### GET /api/tasks/v2
- List tasks with filtering by:
  - `status`: today, upcoming, waiting_on_homeowner, completed, all
  - `taskType`: follow_up_needed, book_inspection, answer_question, update_lead_info, high_urgency_issue
  - `urgency`: high, normal, low
  - `assignedTo`: me, all, or userId
  - `contactId`, `leadId`, `campaignId`
  - `overdue`: boolean
- Returns grouped tasks by status and stats

#### POST /api/tasks/v2
- Create a new task
- Auto-determines status based on due date
- Supports all task types and urgency levels

#### PATCH /api/tasks/v2/[id]
- Update task (status, urgency, type, title, description, notes, dueAt, assignedTo, completed, metadata)
- Auto-updates status when due date changes
- Auto-sets completed_at when marked complete

#### DELETE /api/tasks/v2/[id]
- Delete a task

#### POST /api/tasks/v2/bulk
- Bulk operations: complete or delete multiple tasks

#### POST /api/tasks/v2/auto-generate
- Trigger auto-generation from various sources:
  - `inbox` - Already handled by triggers
  - `scheduler` - Create tasks from scheduler events
  - `pipeline` - Create tasks from pipeline movement
  - `weather` - Create storm opportunity tasks
  - `list_intelligence` - Create tasks for old quotes or neighborhood lists

#### POST /api/tasks/v2/followup-cycle
- Update follow-up cycles (should be called by cron hourly/daily)

#### POST /api/tasks/v2/urgency-update
- Update task urgency (should be called by cron hourly)

### 3. UI Components ✅

**Task Board Page**: `/tasks-v2`

**Features:**
- Kanban board with 4 columns:
  - **Today** (orange) - Tasks due today
  - **Upcoming** (blue) - Tasks due in next 7 days
  - **Waiting on Homeowner** (yellow) - Tasks waiting for homeowner response
  - **Completed** (green) - Completed tasks
- Drag & drop between columns
- Task cards show:
  - Task type icon and label
  - Urgency badge (🔥 High, 🟡 Normal, 🟦 Low)
  - Title and description
  - Last message snippet
  - Next step suggestion
  - Due date/time
  - Storm risk indicator
  - Insurance indicator
  - Quick actions (View Contact, View Thread)
- Filters:
  - Search by title/description/message
  - Filter by urgency (All, High, Normal, Low)
  - Filter by task type
- Stats banner showing:
  - Total tasks
  - Overdue count
  - High urgency count
- Auto-refresh every 60 seconds

### 4. Auto-Created Tasks ✅

Tasks are automatically created from:

**From Inbox:**
- New reply → AI checks → creates needed task
- Unanswered question → "Answer Question"
- Booking intent → "Book Inspection"
- Urgent damage → "High Urgency Issue"

**From Scheduler:**
- Appointment booked → Follow-up reminder
- Appointment missed → Recovery sequence task

**From Pipeline:**
- Lead moved to HOT → Schedule task
- Lead stuck for 7 days → Follow-up task

**From Weather Engine:**
- Storm hits neighborhood → "Storm Opportunity" task
- High-risk homeowners flagged → Bulk task

**From List Intelligence:**
- Old quote list imported → "Revive Quote" tasks
- Neighborhood lists → "Geo Outreach" tasks

### 5. Urgency Levels ✅

Each task is tagged with urgency:

- **🔥 High Urgency**: Storm risk, urgent keywords, insurance timeline, overdue
- **🟡 Normal**: Standard follow-ups, warm leads
- **🟦 Low**: General follow-up, administrative tasks

### 6. Follow-Up Cycles ✅

**Warm Leads:**
- Follow up every 2 days × 3
- Then every 4 days × 2
- Then weekly

**Cold Leads:**
- Follow up in 7 days
- Then stop

**Old Quotes:**
- Follow up every 10 days × 3

**Insurance:**
- Follow-up until claim resolved
- Special logic for adjuster dates

### 7. Pipeline Integration ✅

When task is completed:
- SmartSend suggests next step:
  - Move to HOT
  - Move to WARM
  - Move to Inspection Booked
  - Move to Insurance
  - Move to Not Interested

## 🗂️ File Structure

```
supabase/migrations/
  └── 20250130000001_block_16200_tasks_followup_board_v1.sql

app/api/tasks/v2/
  ├── route.ts                    # GET, POST /api/tasks/v2
  ├── [id]/route.ts               # PATCH, DELETE /api/tasks/v2/[id]
  ├── bulk/route.ts               # POST /api/tasks/v2/bulk
  ├── auto-generate/route.ts      # POST /api/tasks/v2/auto-generate
  ├── followup-cycle/route.ts     # POST /api/tasks/v2/followup-cycle
  └── urgency-update/route.ts     # POST /api/tasks/v2/urgency-update

app/(app)/
  └── tasks-v2/
      └── page.tsx                # Task board UI
```

## 🚀 Usage

### For Roofers

1. **Daily Workflow:**
   - Log in → See "Today's Tasks: 7 Items"
   - Open Today column
   - Process tasks: Book inspections, Answer questions, Follow up on warm leads
   - Drag tasks between columns as needed

2. **Task Types:**
   - **Follow-Up Needed**: Warm replies, unanswered questions, pipeline movement
   - **Book Inspection**: Hot replies, booking intent, insurance intent
   - **Answer Question**: Pricing queries, availability questions
   - **Update Lead Info**: New info, storm data, insurance claim
   - **High Urgency Issue**: Leaks, water damage, urgent language

3. **Quick Actions:**
   - Click "View Contact" to see homeowner profile
   - Click "View Thread" to see conversation
   - Drag tasks between columns
   - Mark complete with checkbox

### For Developers

**Create a task:**
```typescript
const response = await fetch('/api/tasks/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskType: 'book_inspection',
    urgency: 'high',
    title: 'Book inspection - Hot lead',
    description: 'Homeowner expressed strong interest',
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    contactId: '...',
    metadata: {
      reply_intent: 'hot',
      storm_risk: 'high',
    },
  }),
});
```

**Update task status:**
```typescript
await fetch(`/api/tasks/v2/${taskId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'completed' }),
});
```

**Trigger auto-generation:**
```typescript
await fetch('/api/tasks/v2/auto-generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'weather',
    data: {
      workspaceId: '...',
      contacts: ['contact-id-1', 'contact-id-2'],
      stormDate: new Date().toISOString(),
    },
  }),
});
```

## 🔧 Setup

### 1. Run Migration

Execute the migration in Supabase SQL Editor:
```sql
-- Run: supabase/migrations/20250130000001_block_16200_tasks_followup_board_v1.sql
```

### 2. Set Up Cron Jobs

Configure cron jobs to call:
- `/api/tasks/v2/followup-cycle` - Hourly or daily
- `/api/tasks/v2/urgency-update` - Hourly

Example using Vercel Cron:
```json
{
  "crons": [
    {
      "path": "/api/tasks/v2/followup-cycle",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/tasks/v2/urgency-update",
      "schedule": "0 * * * *"
    }
  ]
}
```

### 3. Environment Variables

Ensure these are set:
- `SUPABASE_SERVICE_ROLE_KEY` - For service role operations
- `CRON_SECRET` - Secret for cron job authentication

## 🎯 Key Features

### 🔥 Why Roofers Will LOVE This

1. **They no longer miss warm leads** - SmartSend keeps them ON TRACK
2. **AI tells them exactly what to do** - No thinking. Just execution.
3. **Follow-up becomes consistent** - Fixes the #1 problem in the industry
4. **Every important detail is visible at a glance** - They stop losing leads in the chaos
5. **Storm + Insurance tasks = MASSIVE revenue** - SmartSend becomes a money driver
6. **Daily list gives them purpose** - Roofers feel organized, professional, and in control

## 📊 Task Board Layout

```
┌─────────────┬─────────────┬──────────────────────┬─────────────┐
│   Today     │  Upcoming   │ Waiting on Homeowner │  Completed │
│   (Orange)  │   (Blue)    │      (Yellow)        │  (Green)    │
├─────────────┼─────────────┼──────────────────────┼─────────────┤
│ Task Card 1 │ Task Card 4 │     Task Card 7      │ Task Card 9│
│ Task Card 2 │ Task Card 5 │     Task Card 8      │ Task Card 10│
│ Task Card 3 │ Task Card 6 │                      │             │
└─────────────┴─────────────┴──────────────────────┴─────────────┘
```

## 🔄 Next Steps

1. **Integrate with Inbox** - Show tasks in inbox sidebar
2. **Integrate with Pipeline** - Show tasks when viewing pipeline
3. **Add Notifications** - Notify users of new high-urgency tasks
4. **Add Analytics** - Track task completion rates, time to complete
5. **Add Mobile View** - Optimize for mobile devices
6. **Add Bulk Actions** - Select multiple tasks and bulk complete/assign

## 📝 Notes

- Tasks table supports both `workspace_id` and `org_id` for backwards compatibility
- Auto-generation triggers work automatically when data is inserted
- Follow-up cycles are updated by cron jobs
- Urgency is updated automatically based on metadata and message content
- Task status is auto-updated based on due date when task is created/updated
