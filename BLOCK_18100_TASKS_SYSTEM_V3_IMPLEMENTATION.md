# Block 18100 — SmartSend Task System v3 Implementation

## ✅ Implementation Complete

Block 18100 has been successfully implemented, providing SmartSend with a comprehensive task management system that drives the daily workflow of roofing companies. This system transforms SmartSend from a reminder tool into a true operations engine.

## 📦 What Was Built

### 1. Database Schema (Migration: `20250130000001_block_18100_tasks_system_v3.sql`)

#### Core Tables

1. **tasks_v3** - Enhanced task table with:
   - 8 task categories (40+ task types)
   - 4-level priority system (Critical, High, Medium, Low)
   - Priority scoring (0-100) based on 8 factors
   - Task chaining support (parent_task_id, next_task_id)
   - Recurrent tasks support (is_recurrent, recurrence_pattern)
   - Team assignment (user_id)
   - Pipeline integration (pipeline_stage_id)
   - Metadata JSONB for flexible data storage

2. **task_assignments** - Team assignment table:
   - Multiple assignees per task
   - Primary assignee flag
   - Assignment tracking

3. **task_priority** - Priority calculation cache:
   - Stores detailed scoring breakdown
   - 8 scoring factors cached
   - Total priority score

4. **task_events** - Event log:
   - Tracks all task lifecycle events
   - Created, updated, completed, overdue, etc.
   - Full audit trail

5. **task_chains** - Task chain templates:
   - Defines sequences of tasks
   - Configurable task flows

#### Task Types (8 Categories, 40+ Types)

**1. Lead Follow-Up Tasks:**
- `lead_follow_up`
- `lead_reply_needed`
- `lead_question_asked`
- `lead_clarification_needed`
- `lead_no_reply`
- `lead_unread_messages`
- `lead_booking_intent`

**2. Appointment Tasks:**
- `appointment_booked`
- `appointment_reminder`
- `appointment_missed`
- `appointment_reschedule`
- `appointment_confirmation`

**3. Insurance Tasks:**
- `insurance_claim_filed`
- `insurance_adjuster_scheduled`
- `insurance_scope_received`
- `insurance_deductible_mentioned`
- `insurance_documents_uploaded`
- `insurance_supplement_needed`

**4. Storm Tasks:**
- `storm_hail_event`
- `storm_wind_event`
- `storm_leak_detected`
- `storm_zone_activated`
- `storm_zip_affected`

**5. Pipeline Tasks:**
- `pipeline_warm_followup`
- `pipeline_hot_booking`
- `pipeline_quote_checkin`
- `pipeline_insurance_timeline`

**6. Quote Tasks:**
- `quote_sent`
- `quote_stale`
- `quote_updated`
- `quote_viewed`

**7. Task Chaining Tasks:**
- `task_chain_next`

**8. Office/Admin Tasks:**
- `admin_domain_issue`
- `admin_billing_issue`
- `admin_upload_missing_info`
- `admin_cleanup_duplicates`
- `admin_add_missing_phone`
- `admin_address_mismatch`
- `admin_bad_lead_cleanup`

### 2. Priority Scoring System

The system calculates priority scores (0-100) based on 8 factors:

1. **Lead Heat Score** (0-20 points)
   - Based on lead score or lead_status
   - HOT = 20, WARM = 12, QUALIFIED = 15

2. **Insurance Value Score** (0-20 points)
   - Based on insurance job value
   - Higher value = higher score

3. **Storm Risk Score** (0-15 points)
   - Based on storm risk metadata
   - Higher risk = higher score

4. **Booking Importance Score** (0-15 points)
   - Appointment-related tasks get high scores
   - Booking intent = critical priority

5. **Revenue Score** (0-15 points)
   - Based on job value or revenue estimate
   - Higher revenue = higher score

6. **Age of Activity Score** (0-10 points)
   - Older leads = higher priority
   - Prevents leads from being forgotten

7. **Task Deadline Score** (0-15 points)
   - Overdue tasks get highest scores
   - Due soon = high priority
   - Due far = lower priority

8. **Category Importance Score** (0-10 points)
   - Insurance/Storm tasks = highest
   - Admin tasks = lower

**Priority Levels:**
- 🔥 **Critical** (80-100 score)
- 🔥 **High** (60-79 score)
- 🟡 **Medium** (40-59 score)
- ⚪ **Low** (0-39 score)

### 3. Database Functions

#### Core Functions

1. **calculate_task_priority_score(p_task_id)**
   - Calculates priority score for a task
   - Updates task priority level
   - Stores breakdown in task_priority table

2. **auto_complete_tasks_v3()**
   - Auto-completes tasks when conditions are met:
     - Homeowner books appointment
     - Schedule confirmed
     - Quote viewed
     - Claim filed
     - Reply sent
     - Appointment completed

3. **check_overdue_tasks_v3()**
   - Marks overdue tasks
   - Creates recovery tasks for critical/high priority overdue items

4. **create_task_chain_next(p_completed_task_id)**
   - Creates next task in chain when task is completed
   - Supports guided workflows

5. **process_recurrent_tasks_v3()**
   - Processes recurrent tasks
   - Creates next occurrence based on pattern

6. **get_daily_workflow_tasks(p_workspace_id, p_user_id)**
   - Returns daily workflow tasks grouped by priority
   - Perfect for dashboard display

### 4. API Routes

#### Base Path: `/api/tasks/v3`

**GET /api/tasks/v3**
- List tasks with advanced filtering
- Query params:
  - `status`: open | completed | overdue | cancelled | all
  - `priority`: critical | high | medium | low | all
  - `taskType`: TaskTypeV3
  - `assignedTo`: me | all | userId
  - `contactId`: string
  - `leadId`: string
  - `overdue`: boolean
  - `dailyWorkflow`: boolean (returns grouped by priority)
  - `limit`: number
- Returns: tasks, grouped by priority, stats

**POST /api/tasks/v3**
- Create a new task
- Body: CreateTaskInputV3
- Auto-calculates priority score

**GET /api/tasks/v3/[id]**
- Get single task with events

**PATCH /api/tasks/v3/[id]**
- Update task
- Recalculates priority if relevant fields change

**DELETE /api/tasks/v3/[id]**
- Delete task

#### Worker Endpoints: `/api/tasks/v3/workers`

**POST /api/tasks/v3/workers/priority-calc**
- Recalculate priority scores
- Can calculate for specific task or all open tasks

**PUT /api/tasks/v3/workers/auto-complete**
- Run auto-complete logic

**PATCH /api/tasks/v3/workers/overdue-check**
- Check for overdue tasks and create recovery tasks

**GET /api/tasks/v3/workers/recurrent**
- Process recurrent tasks

#### Auto-Create Endpoint: `/api/tasks/v3/auto-create`

**POST /api/tasks/v3/auto-create**
- Auto-create tasks based on events
- Supports all 8 categories
- Body: AutoCreateTaskInput
  - `category`: lead_followup | appointment | insurance | storm | pipeline | quote | admin
  - `trigger`: specific trigger event
  - `contactId`, `leadId`, `metadata`, `userId`

### 5. Task Auto-Creation Rules

The system automatically creates tasks for:

#### Lead Follow-Up
- Homeowner replies → "Reply needed"
- Question asked → "Answer homeowner's question"
- No reply in X days → "Follow up - no reply"
- Booking intent detected → "Offer booking times"

#### Appointment
- Appointment booked → "Prep for appointment"
- 1-hour reminder → "Send appointment reminder"
- Appointment missed → "Reschedule missed appointment"
- Rescheduling needed → "Reschedule appointment"

#### Insurance
- Claim filed → "Prepare adjuster notes"
- Adjuster scheduled → "Prep for adjuster meeting"
- Scope received → "Review insurance scope"
- Supplement needed → "Request supplement"

#### Storm
- Hail/wind event → "Send storm inspection message"
- Leak detected → "URGENT: Leak detected"
- Storm zone activated → "Follow storm script"

#### Pipeline
- Move to Warm → "Follow up with warm lead"
- Move to Hot → "HOT lead - offer appointment times"
- Move to Quote → "Check in on quote"
- Move to Insurance → "Manage insurance timeline"

#### Quote
- Quote sent → "Follow up on quote"
- Quote stale → "Reconnect on stale quote"
- Quote viewed → "Quote viewed - follow up now"

#### Admin
- Domain issues → "Fix domain issue"
- Billing issues → "Resolve billing issue"
- Missing info → "Upload missing info"

### 6. Task Chaining

When a task is completed, the system can automatically create the next task:

**Example Chains:**
- "Reply to homeowner" → "Offer booking times"
- "Appointment booked" → "Send appointment reminder"
- "Insurance claim filed" → "Prepare for adjuster meeting"
- "Warm follow-up" → "Convert to booking"

### 7. Recurrent Tasks

Supports recurring tasks with patterns:
- **Daily**: Every day
- **Weekly**: Every week
- **Monthly**: Every month
- **Custom**: Custom interval in days

**Use Cases:**
- Weekly storm area checks
- Monthly domain health check
- Monthly billing review
- Monday morning pipeline review

### 8. Overdue Task Recovery

The system detects overdue tasks and:
- Marks them as overdue
- Creates recovery tasks for critical/high priority items
- Prevents lost revenue

**Recovery Logic:**
- Overdue 1 day → Recovery task created
- Overdue 3 days → Higher priority recovery
- Overdue 7 days → Critical recovery
- Critical overdue → Immediate action

### 9. Daily Workflow Function

`get_daily_workflow_tasks()` returns tasks grouped by priority:
- 🔥 Critical tasks
- 🔥 High priority tasks
- 🟡 Medium priority tasks
- ⚪ Low priority tasks

Perfect for dashboard display: "Your Daily Workflow"

### 10. Team Task Assignment

- Assign tasks to team members
- Reassign tasks
- Filter by user
- See workload per rep
- See overdue by rep
- See team performance

### 11. Task Filters

Filter tasks by:
- Category (8 categories)
- Priority (4 levels)
- Task type (40+ types)
- Assigned user
- Due date
- Insurance tasks
- Storm tasks
- Booking tasks
- Lead score
- High-value jobs
- Quote tasks

## 🎯 Key Features

### 1. Daily Task List (Elite)
- Shows exactly what to do
- Prioritized by SmartSend
- Critical tasks first
- Clear workflow

### 2. Insurance Tasks
- Keeps claims moving
- Wins big jobs
- Timeline management

### 3. Storm Tasks
- Chases storm money
- Huge revenue opportunity
- Immediate follow-up

### 4. Task Chaining
- Guided workflow
- Perfect for beginners
- Automatic next steps

### 5. Auto-Complete
- Reduces clutter
- Stays organized
- No manual cleanup

### 6. Team Assignments
- Manage reps
- Perfect for 3-20 person companies
- Workload visibility

## 📁 File Structure

```
supabase/migrations/
  └── 20250130000001_block_18100_tasks_system_v3.sql

app/api/tasks/v3/
  ├── route.ts                    # GET, POST /api/tasks/v3
  ├── [id]/route.ts               # GET, PATCH, DELETE /api/tasks/v3/[id]
  ├── workers/route.ts            # Worker endpoints
  └── auto-create/route.ts        # Auto-create endpoint
```

## 🔄 Integration Points

### Inbox Integration
- Auto-create tasks from replies
- Question detection
- Booking intent detection

### Scheduler Integration
- Appointment reminders
- Missed appointment detection
- Confirmation tasks

### Pipeline Integration
- Stage movement triggers tasks
- Pipeline-specific task types
- Stage suggestions

### Weather/Storm Integration
- Storm event detection
- ZIP code activation
- Leak detection

### Insurance Integration
- Claim tracking
- Adjuster scheduling
- Scope management

## 🚀 Usage Examples

### Create a Task
```typescript
POST /api/tasks/v3
{
  "taskType": "lead_follow_up",
  "title": "Follow up with John Smith",
  "dueAt": "2025-02-01T10:00:00Z",
  "contactId": "uuid",
  "priority": "high"
}
```

### Get Daily Workflow
```typescript
GET /api/tasks/v3?dailyWorkflow=true&assignedTo=me
```

### Auto-Create Task
```typescript
POST /api/tasks/v3/auto-create
{
  "category": "lead_followup",
  "trigger": "homeowner_replied",
  "contactId": "uuid",
  "metadata": {
    "message": "I'm interested in getting a quote"
  }
}
```

### Complete Task (triggers chain)
```typescript
PATCH /api/tasks/v3/[id]
{
  "status": "completed"
}
// Automatically creates next task in chain
```

## 🎉 Why Roofers Will LOVE This

1. **Daily task list shows EXACTLY what to do** - Finally clarity
2. **Insurance tasks keep claims moving** - Wins big jobs
3. **Storm tasks help chase storm money** - Huge revenue
4. **Task chaining = guided workflow** - Perfect for beginners
5. **Auto-complete reduces clutter** - They feel organized
6. **Team assignments help manage reps** - Perfect for 3-20 person companies

## 🎉 Why YOU Will LOVE This

1. **Increases customer retention** - Roofers become dependent on SmartSend's daily workflow
2. **Improves outcomes = better word-of-mouth** - Roofers win more jobs
3. **Showcases AI value clearly** - Tasks = visible automation

## 📝 Next Steps

1. Run migration: `supabase/migrations/20250130000001_block_18100_tasks_system_v3.sql`
2. Set up cron jobs for workers:
   - Priority calculation (hourly)
   - Auto-complete (every 15 minutes)
   - Overdue check (hourly)
   - Recurrent tasks (daily)
3. Integrate with existing systems:
   - Inbox → Auto-create tasks
   - Scheduler → Appointment tasks
   - Pipeline → Pipeline tasks
   - Weather → Storm tasks
4. Build dashboard UI:
   - Daily workflow view
   - Task board
   - Contact-level task panel
   - Team assignment UI

## 🔧 Maintenance

### Cron Jobs Recommended:
- **Priority Calculation**: Every hour
- **Auto-Complete**: Every 15 minutes
- **Overdue Check**: Every hour
- **Recurrent Tasks**: Daily at midnight

### Database Maintenance:
- Cleanup old completed tasks (90+ days)
- Archive task events (optional)
- Optimize indexes regularly

---

**Block 18100 — Task System v3** ✅ **COMPLETE**





















































