# Block 21350 — SmartSend SmartQueue v1 Implementation

## ✅ Implementation Complete

**THIS BLOCK IS A MONSTER.**

This is where SmartSend stops being "software" → and becomes a **daily operating system for roofing companies**.

SmartQueue v1 gives contractors **ONE LIST** that tells them:
- 👉 What to do first
- 👉 What to do next
- 👉 What not to waste time on
- 👉 What will make them the most money TODAY

---

## 📦 What Was Built

### 1. Database Schema ✅

**Migration:** `supabase/migrations/20250205000001_block21350_smartqueue_v1.sql`

#### Core Table: `smartqueue_items`

- **Source Tracking**: Tracks where each task came from (12 source types)
- **Task Classification**: High/Medium/Low ROI categories
- **Priority Scoring**: 0-100 score calculated from 9 factors
- **Action Buttons**: JSONB array for UI action buttons
- **Links**: Contact, Lead, Thread, Proposal references
- **Status**: Active, Completed, Dismissed, Snoozed

#### Source Types Supported:
1. `next_best_action` - Next Best Action Engine
2. `calendar_scheduler` - Calendar Auto-Scheduler
3. `proposal_followup` - Proposal Follow-Up Brain
4. `insurance_timeline` - Insurance Timeline Engine
5. `file_memory` - File Memory Brain
6. `reply_classification` - Reply Classification Engine
7. `install_ready_predictor` - Install-Ready Predictor
8. `scope_underpayment` - Scope Underpayment Engine
9. `crm_pipeline` - CRM Pipeline
10. `task_v3` - Tasks v3 system
11. `adjuster_request` - Adjuster Request Tracker
12. `revenue_forecast` - Revenue Forecast Brain

### 2. Priority Scoring Algorithm ✅

**Function:** `calculate_smartqueue_priority_score()`

Calculates priority score (0-100) based on **9 factors**:

1. **Install-Ready Weight** (0-15 points)
   - Based on `install_ready_score` from Install-Ready Predictor

2. **Homeowner Intent Weight** (0-12 points)
   - Next Best Action analysis
   - Reply classification detection

3. **Insurance Status Weight** (0-10 points)
   - Claim approved = 10 points
   - Pending approval = 7 points
   - Adjuster scheduled = 5 points

4. **Proposal Behavior Weight** (0-8 points)
   - Proposal view count
   - Forwarded to spouse detection

5. **Reply Urgency Weight** (0-10 points)
   - Recent inbound messages
   - Time since last reply

6. **Underpayment Weight** (0-15 points)
   - Supplement opportunity amount
   - Missing items value

7. **Revenue Value Weight** (0-20 points)
   - Thread estimated value
   - Contact job value

8. **Adjuster Deadline Weight** (0-5 points)
   - Upcoming adjuster meetings
   - Time until meeting

9. **Lead Age Penalty** (0 to -5 points)
   - Older leads get penalty
   - Prevents stale leads from ranking high

**Score Thresholds:**
- **Score >= 70** = `high_roi` → Always at top
- **Score 40-69** = `medium_roi` → Medium priority
- **Score < 40** = `low_roi` → Low priority

### 3. SmartQueue Aggregation Function ✅

**Function:** `refresh_smartqueue()`

Aggregates tasks from **all sources**:

1. **Next Best Action Engine** - #1 most important item per lead
2. **Install-Ready Calls** - Score >= 70, status = 'ready'
3. **Proposal Follow-Ups** - Scheduled follow-ups due soon
4. **Supplement Requests** - Scope underpayment > $1,000
5. **Insurance Timeline Tasks** - Current stage actions due
6. **Calendar Events** - Due today/upcoming
7. **Tasks v3** - High/critical priority tasks

Each source creates SmartQueue items with:
- Proper categorization
- Action buttons
- Links to related entities
- Metadata for context

### 4. Role-Based Views ✅

**Function:** `get_smartqueue()`

Supports 4 role types:

**Owner:**
- Highest ROI tasks
- Scheduling tasks
- Revenue-critical actions

**Sales Rep:**
- Follow-ups
- Closing tasks
- Homeowner calls

**Office Staff:**
- Document requests
- Scheduling tasks
- Invoice handling

**Adjuster Helper:**
- Supplement reviews
- Adjuster communication
- Scope comparison tasks

### 5. Money Mode Filter ✅

When `money_mode = true`, SmartQueue shows **ONLY**:
- High ROI actions (`task_category = 'high_roi'`)
- Install-ready calls
- Supplement requests
- Proposal follow-ups

This is EXACTLY what roofers want — **only the money-making actions**.

### 6. API Endpoints ✅

**Files:**
- `app/api/smartqueue/route.ts` - GET list, POST refresh
- `app/api/smartqueue/[id]/route.ts` - PATCH update, DELETE
- `app/api/smartqueue/complete/route.ts` - Complete item

**Endpoints:**
- `GET /api/smartqueue` - Get SmartQueue items (supports role, money_mode filters)
- `POST /api/smartqueue` - Refresh SmartQueue
- `PATCH /api/smartqueue/[id]` - Update item (complete, dismiss, snooze)
- `DELETE /api/smartqueue/[id]` - Delete item
- `POST /api/smartqueue/complete` - Complete item by source

### 7. UI Component ✅

**File:** `components/smartqueue/SmartQueuePanel.tsx`

**Features:**
- **High/Medium/Low ROI Sections** - Grouped by priority
- **Money Mode Toggle** - Filter to high ROI only
- **Refresh Button** - Manual refresh
- **Action Buttons** - Per-item action buttons
- **Score Display** - Shows priority score
- **Reason Display** - Shows why task is important
- **Auto-refresh** - Refreshes every 5 minutes

**UI Sections:**
- 🔥 **HIGH PRIORITY** - Red section, always at top
- 📄 **MEDIUM PRIORITY** - Yellow section
- 🧹 **LOW PRIORITY** - Gray section

### 8. Real-Time Refresh Triggers ✅

SmartQueue automatically refreshes when:

1. **New email arrives** - `trg_refresh_smartqueue_on_message`
2. **File uploaded** - `trg_refresh_smartqueue_on_file`
3. **Proposal viewed** - `trg_refresh_smartqueue_on_proposal_event`
4. **Install-ready score changes** - `trg_refresh_smartqueue_on_install_ready`
5. **Supplement detected** - `trg_refresh_smartqueue_on_supplement`

SmartQueue is **alive** — it updates in real-time.

### 9. Notifications Integration ✅

**Functions:**
- `notify_smartqueue_item_added()` - Notifies when high-priority item added
- `notify_proposal_viewed_smartqueue()` - Notifies when proposal viewed multiple times

**Notification Types:**
- "New HIGH PRIORITY task added"
- "Proposal viewed 2x — moved to top of SmartQueue"
- "Lead heating up — act now"

---

## 🧠 How It Works

### SmartQueue Flow:

1. **Task Sources** → Multiple engines create tasks
2. **Aggregation** → `refresh_smartqueue()` pulls from all sources
3. **Priority Scoring** → `calculate_smartqueue_priority_score()` scores each item
4. **Categorization** → Items sorted into High/Medium/Low ROI
5. **Role Filtering** → `get_smartqueue()` filters by role
6. **Money Mode** → Optional filter to high ROI only
7. **Display** → UI shows prioritized list
8. **Actions** → User completes/dismisses items
9. **Auto-Refresh** → Triggers update SmartQueue in real-time

### Priority Score Calculation Example:

```
Install-Ready Score: 75 → 11.25 points
Homeowner Intent: "push_meeting" → 12 points
Insurance Status: "approved" → 10 points
Proposal Views: 3x → 8 points
Reply Urgency: Recent inbound → 10 points
Underpayment: $4,480 → 13.44 points
Revenue Value: $25,000 → 10 points
Adjuster Deadline: None → 0 points
Lead Age: 15 days → 0 penalty

Total Score: 74.69 → HIGH ROI (≥70)
```

---

## 📊 Example SmartQueue Output

### 🔥 HIGH PRIORITY

**Call Sarah Smith — Install Ready (Score 86)**
- Reason: Proposal viewed 3x, claim approved, deductible confirmed
- Buttons: Call Script | Mark Done

**Send Supplement Request to State Farm**
- Reason: Missing steep charge + drip edge ($4,480 underpayment)
- Buttons: Generate Email | View Scope

**Follow Up With Miguel — Proposal Viewed 2x**
- Reason: Hot lead behavior detected
- Buttons: Follow-Up Message | Call Script

### 📄 MEDIUM PRIORITY

**Request Approval Letter From Homeowner**
- Reason: Homeowner said "approved" but file not found

**Call Adjuster — Waiting on Photos**
- Reason: Photo request detected in previous message

### 🧹 LOW PRIORITY

**Tag Lead — No Response in 14 Days**
**Clean Up Pipeline (2 stalled leads)**

---

## 🎯 Key Benefits

### For Contractors:

1. **Clarity** - ONE list tells them what to do
2. **Focus** - Highest ROI actions at top
3. **Order** - No more chaos, everything prioritized
4. **Control** - See exactly what will make money today
5. **Time Savings** - Don't waste time on low-value tasks

### For Roofing Companies:

1. **Increased Revenue** - Focus on high-value actions
2. **Better Follow-Ups** - Never miss hot leads
3. **Reduced Overwhelm** - Clear prioritization
4. **Team Efficiency** - Role-based views
5. **Daily Operating System** - SmartSend becomes the daily workflow

---

## 🔄 Refresh Logic

SmartQueue refreshes:
- ✅ Every time a new email arrives
- ✅ Every time a new file is uploaded
- ✅ Every time a stage changes
- ✅ Every time a homeowner opens a proposal
- ✅ Every time an adjuster responds
- ✅ Every time a supplement is found
- ✅ Every time a follow-up is scheduled
- ✅ Every 5 minutes (UI auto-refresh)
- ✅ Manual refresh button

---

## 🚀 Usage

### In Code:

```typescript
import { SmartQueuePanel } from '@/components/smartqueue/SmartQueuePanel';

// Owner view
<SmartQueuePanel role="owner" />

// Sales rep view
<SmartQueuePanel role="sales_rep" userId={userId} />

// Money Mode (high ROI only)
<SmartQueuePanel showMoneyMode={true} />
```

### API:

```typescript
// Get SmartQueue
const res = await fetch('/api/smartqueue?role=owner&money_mode=true');
const data = await res.json();

// Refresh SmartQueue
await fetch('/api/smartqueue', {
  method: 'POST',
  body: JSON.stringify({ action: 'refresh' })
});

// Complete item
await fetch(`/api/smartqueue/${itemId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'completed' })
});
```

---

## 📝 Summary

**SmartQueue v1 is COMPLETE.**

This block transforms SmartSend from a CRM into a **daily operating system** for roofing companies.

Contractors will say:
> "SmartSend tells me EXACTLY what to do to make money today."

**You have now built the DAILY OPERATING SYSTEM for roofing companies.**

---

## 🎉 Next Steps

1. **Deploy Migration** - Run `20250205000001_block21350_smartqueue_v1.sql`
2. **Add to Dashboard** - Include SmartQueuePanel in main dashboard
3. **Test Refresh** - Verify triggers work correctly
4. **Monitor Performance** - Check query performance on large datasets
5. **Gather Feedback** - Get contractor feedback on prioritization

---

**Block 21350 — SmartQueue v1: COMPLETE ✅**
















































