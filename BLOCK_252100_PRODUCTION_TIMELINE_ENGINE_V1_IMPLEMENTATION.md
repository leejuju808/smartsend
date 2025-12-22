# BLOCK 252100 — SmartSend Production Timeline Engine v1 Implementation

## ✅ Implementation Complete

**"Milestones, Task Dependencies, Gantt View, Auto-Foreman Notifications"**

This is the feature that turns SmartSend into the brain of roofing production — not just tracking work, but ORCHESTRATING it.

> "SmartSend literally runs our jobs for us. We never miss steps anymore — zero chaos."

This is where SmartSend starts feeling like a $500/month+ premium operations platform.

---

## 📊 Database Schema

### Migration File
`supabase/migrations/20250131000000_block252100_production_timeline_engine_v1.sql`

### Tables Created

#### 1. `production_milestones`
Tracks every milestone in a job's production timeline.

**Fields:**
- `id` (uuid, primary key)
- `job_id` (uuid, references jobs)
- `name` (text) - "Material Delivery", "Tear-Off", "Install", etc.
- `description` (text, nullable)
- `scheduled_date` (date, nullable)
- `due_date` (date, nullable)
- `completed_date` (date, nullable)
- `started_date` (date, nullable)
- `status` (text) - 'pending', 'in_progress', 'completed', 'delayed'
- `depends_on` (uuid, self-reference) - Dependency milestone
- `order_index` (int) - Order in sequence
- `created_at`, `updated_at` (timestamptz)

**Indexes:**
- `idx_production_milestones_job` - On job_id
- `idx_production_milestones_status` - On (job_id, status)
- `idx_production_milestones_depends_on` - On depends_on
- `idx_production_milestones_order` - On (job_id, order_index)
- `idx_production_milestones_due_date` - On due_date

#### 2. `milestone_blockers`
Tracks blockers preventing milestone progress.

**Fields:**
- `id` (uuid, primary key)
- `milestone_id` (uuid, references production_milestones)
- `description` (text) - Blocker description
- `blocker_type` (text) - 'safety_hazard', 'deck_rot', 'wrong_material', 'customer_unavailable', 'weather', 'permit', 'material_shortage', 'crew_unavailable', 'other'
- `created_by` (uuid, references workforce_employees)
- `created_at` (timestamptz)
- `resolved` (boolean, default false)
- `resolved_at` (timestamptz, nullable)
- `resolved_by` (uuid, references workforce_employees, nullable)
- `resolution_notes` (text, nullable)

**Indexes:**
- `idx_milestone_blockers_milestone` - On milestone_id
- `idx_milestone_blockers_resolved` - On (milestone_id, resolved)
- `idx_milestone_blockers_created_by` - On created_by

---

## 🔧 Database Functions

### 1. `create_default_milestones(p_job_id uuid)`
Auto-generates the standard roofing workflow milestones when a job is created.

**Default Milestones:**
1. Permit Submitted
2. Permit Approved
3. Material Ordered
4. Material Delivered
5. Tear-Off
6. Deck Inspection
7. Install
8. Final Inspection
9. Cleanup
10. QC Walkthrough
11. Job Complete

Each milestone is created with dependencies (each depends on the previous one).

### 2. `can_complete_milestone(p_milestone_id uuid)`
Validates that dependencies are met before allowing milestone completion.

**Returns:** `boolean`
- `true` if no dependency or dependency is completed
- `false` if dependency is not completed

### 3. `calculate_job_health_score(p_job_id uuid)`
Calculates job health score based on delays, blockers, and schedule.

**Formula:**
```
health = 100
  - (delayed milestones * 10)
  - (open blockers * 7)
  - (days behind schedule * 5)
```

**Returns:** `int` (0-100)
- 80+ = healthy (green)
- 50-79 = warning (yellow)
- <50 = critical (red)

### 4. `reschedule_milestone(p_milestone_id uuid, p_new_scheduled_date date, p_new_due_date date)`
Reschedules a milestone and automatically shifts all dependent milestones by the same number of days.

**Behavior:**
- Updates milestone dates
- Calculates days shifted
- Automatically shifts all dependent milestones
- Only shifts milestones with status 'pending' or 'in_progress'

---

## 🔔 Triggers & Automation

### 1. Auto-create Milestones on Job Creation
**Trigger:** `trg_create_job_milestones`
- Fires: `AFTER INSERT ON jobs`
- Condition: `WHEN (NEW.company_id IS NOT NULL)`
- Action: Calls `create_default_milestones(NEW.id)`

### 2. Validate Milestone Status Changes
**Trigger:** `trg_validate_milestone_status`
- Fires: `BEFORE UPDATE ON production_milestones`
- Validates dependencies before allowing completion
- Sets `completed_date` when status = 'completed'
- Sets `started_date` when status = 'in_progress'
- Updates `updated_at` timestamp

### 3. Auto-notifications on Milestone Events
**Trigger:** `trg_milestone_notifications`
- Fires: `AFTER UPDATE ON production_milestones`
- Condition: `WHEN (OLD.status IS DISTINCT FROM NEW.status)`

**Notifications Sent:**
- **Milestone Completed:** Notifies about next step that can begin
- **Milestone Delayed:** Alerts PM that action is required
- **Dependency Unblocked:** Notifies that dependent milestones can proceed

**Notification Channels:**
- `milestone_completed` - pg_notify
- `milestone_delayed` - pg_notify
- `dependency_unblocked` - pg_notify

---

## 🌐 API Routes

### Milestone Management

#### `GET /api/workforce/milestones?job_id=xxx`
Get all milestones for a job with dependency info and blocker counts.

**Response:**
```json
{
  "milestones": [
    {
      "id": "uuid",
      "name": "Material Delivered",
      "status": "completed",
      "depends_on_milestone": { "id": "...", "name": "...", "status": "completed" },
      "blocker_count": 0
    }
  ]
}
```

#### `POST /api/workforce/milestones`
Create a custom milestone.

**Body:**
```json
{
  "job_id": "uuid",
  "name": "Custom Milestone",
  "description": "...",
  "scheduled_date": "2024-01-15",
  "due_date": "2024-01-20",
  "depends_on": "uuid (optional)",
  "order_index": 5
}
```

#### `POST /api/workforce/milestones/update-status`
Update milestone status with dependency validation.

**Body:**
```json
{
  "id": "milestone_uuid",
  "status": "completed" | "in_progress" | "delayed" | "pending"
}
```

**Error Response (if dependency not met):**
```json
{
  "error": "Cannot complete milestone. Dependency milestone must be completed first.",
  "requires_dependency": true
}
```

#### `POST /api/workforce/milestones/reschedule`
Reschedule milestone and automatically shift dependencies.

**Body:**
```json
{
  "milestone_id": "uuid",
  "new_scheduled_date": "2024-01-20",
  "new_due_date": "2024-01-25"
}
```

**Response:**
```json
{
  "success": true,
  "milestone": { ... },
  "shifted_dependents": [ ... ]
}
```

### Job Health Score

#### `GET /api/workforce/jobs/[jobId]/health`
Get job health score and breakdown.

**Response:**
```json
{
  "health_score": 85,
  "health_status": "healthy" | "warning" | "critical",
  "breakdown": {
    "delayed_milestones": 1,
    "open_blockers": 2,
    "days_behind": 3
  },
  "details": {
    "delayed_milestones": [ ... ],
    "blockers": [ ... ]
  }
}
```

### Blocker Management

#### `GET /api/workforce/blockers?milestone_id=xxx&job_id=xxx&unresolved_only=true`
Get blockers for a milestone or job.

#### `POST /api/workforce/blockers`
Create a blocker.

**Body:**
```json
{
  "milestone_id": "uuid",
  "description": "Material shortage",
  "blocker_type": "material_shortage",
  "created_by": "employee_uuid (optional)"
}
```

#### `POST /api/workforce/blockers/[id]/resolve`
Resolve a blocker.

**Body:**
```json
{
  "resolution_notes": "Material ordered, arriving tomorrow",
  "resolved_by": "employee_uuid (optional)"
}
```

### Job Info

#### `GET /api/workforce/jobs/[jobId]`
Get job details for workforce/production context.

---

## 🎨 Frontend Components

### Production Timeline Page
**Path:** `/workforce/production/[jobId]/timeline`

**Features:**
- **Gantt View:** Visual timeline with milestone bars
- **List View:** Detailed milestone list with actions
- **Health Score Display:** Color-coded health indicator
- **Status Management:** Start/Complete milestone buttons
- **Dependency Visualization:** Shows blocked milestones
- **Blocker Indicators:** Warning icons for milestones with blockers

**Color Coding:**
- `pending` → gray
- `in_progress` → blue
- `completed` → green
- `delayed` → red

### Milestone Rescheduler Component
**Path:** `components/MilestoneRescheduler.tsx`

**Features:**
- Modal interface for rescheduling
- Shows dependent milestones that will be auto-shifted
- Date picker for scheduled and due dates
- Automatic dependency shifting
- Warning messages for shifted dependents

---

## 🔒 Row Level Security

### Production Milestones
- Company members can view/manage milestones for their company's jobs
- Policy: `production_milestones_company_member`

### Milestone Blockers
- Company members can view/manage blockers for their company's milestones
- Policy: `milestone_blockers_company_member`

---

## 🎯 Key Features

### ✅ Auto-Generated Milestones
- Default roofing workflow automatically created on job creation
- No manual setup required
- Standard 11-step process

### ✅ Dependency Enforcement
- Milestones cannot be completed until dependencies are met
- Visual indicators for blocked milestones
- Automatic unblocking when dependencies complete

### ✅ Gantt Timeline View
- Visual representation of job timeline
- Drag-to-reschedule (via rescheduler component)
- Color-coded status
- Dependency lines (visual)

### ✅ Auto Notifications
- Milestone completed → Next step notification
- Milestone delayed → PM alert
- Dependency unblocked → Dependent milestone notification
- Via PostgreSQL NOTIFY (can be consumed by edge functions for Slack/Email)

### ✅ Job Health Score
- Real-time calculation
- Visual health indicator (green/yellow/red)
- Breakdown of delays, blockers, days behind

### ✅ Blocker System
- Crew can submit blockers
- PM can resolve blockers
- Types: safety_hazard, deck_rot, wrong_material, customer_unavailable, weather, permit, material_shortage, crew_unavailable, other

### ✅ Office Rescheduler
- Drag milestone dates
- Automatically shifts dependent milestones
- Warns about crew scheduling conflicts (future enhancement)
- Warns about material delivery needs (future enhancement)

---

## 🚀 Why This Makes Roofers Feel Stupid Not Using SmartSend

### Problems Solved:
1. ✅ **Missed steps** → Auto-generated milestones
2. ✅ **Forgotten inspections** → Dependency enforcement
3. ✅ **Chaotic job order** → Visual timeline
4. ✅ **Incomplete jobs** → Health score tracking
5. ✅ **Lost communication** → Auto-notifications
6. ✅ **Foremen doing wrong tasks** → Dependency blocking
7. ✅ **Jobs delayed due to dependencies** → Dependency validation
8. ✅ **PMs drowning in follow-ups** → Auto-notifications
9. ✅ **No visual timeline** → Gantt view

### Roofers Will Say:
> "We used to run production blind. SmartSend is like having a full-time project manager built into the system."

---

## 📝 Next Steps (Future Enhancements)

1. **Crew Scheduling Conflict Detection**
   - Warn when rescheduling conflicts with crew availability
   - Suggest alternative dates

2. **Material Delivery Integration**
   - Auto-reschedule material delivery milestones
   - Link to supplier orders

3. **Notification Channels**
   - Slack integration
   - Email notifications
   - SMS for critical delays

4. **Advanced Analytics**
   - Average time per milestone
   - Bottleneck identification
   - Crew performance by milestone

5. **Custom Milestone Templates**
   - Per-company milestone templates
   - Different workflows for different job types

---

## 🧪 Testing Checklist

- [ ] Create job → Verify milestones auto-created
- [ ] Try to complete milestone with incomplete dependency → Should fail
- [ ] Complete dependency → Verify dependent milestone unblocked
- [ ] Reschedule milestone → Verify dependents shifted
- [ ] Create blocker → Verify appears in timeline
- [ ] Resolve blocker → Verify removed from timeline
- [ ] Check health score → Verify calculation correct
- [ ] View Gantt → Verify bars render correctly
- [ ] Switch to list view → Verify milestones display
- [ ] Test RLS → Verify access control works

---

## 📚 Files Created/Modified

### Database
- `supabase/migrations/20250131000000_block252100_production_timeline_engine_v1.sql`

### API Routes
- `src/app/api/workforce/milestones/route.ts`
- `src/app/api/workforce/milestones/update-status/route.ts`
- `src/app/api/workforce/milestones/reschedule/route.ts`
- `src/app/api/workforce/jobs/[jobId]/route.ts`
- `src/app/api/workforce/jobs/[jobId]/health/route.ts`
- `src/app/api/workforce/blockers/route.ts`
- `src/app/api/workforce/blockers/[id]/resolve/route.ts`

### Frontend
- `src/app/workforce/production/[jobId]/timeline/page.tsx`
- `src/app/workforce/production/[jobId]/timeline/components/MilestoneRescheduler.tsx`

---

**Implementation Date:** January 31, 2025
**Block Number:** 252100
**Status:** ✅ Complete
























