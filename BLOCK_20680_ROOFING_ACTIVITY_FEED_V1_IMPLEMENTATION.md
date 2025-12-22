# Block 20680 — SmartSend Roofing Activity Feed v1 Implementation

## 🎯 Mission

This block ties the entire SmartSend insurance engine together into a SINGLE, clean stream.

**Roofing companies constantly lose track because:**
- Leads come from everywhere
- Emails get buried
- Adjusters reply at random times
- Follow-ups get forgotten
- Staff doesn't know what's happening
- Owners don't know if jobs are moving

**SmartSend Activity Feed v1 fixes ALL of that.**

This creates a real-time feed of everything SmartSend detects, sends, or updates.
It makes SmartSend feel like a mission control center for roofing operations.

---

## ✅ Implementation Complete

### 1. Database Migration ✅
**File**: `supabase/migrations/20250130000002_block20680_roofing_activity_feed_v1.sql`

**New Table: `activity_feed_events`**
- Comprehensive activity feed table with all roofing event types
- Fields:
  - `id`, `created_at`
  - `lead_id`, `job_id`, `thread_id`, `campaign_id` (flexible linking)
  - `event_type` (ENUM with all roofing-specific events)
  - `event_text` (human-readable description)
  - `event_payload` (JSONB for event-specific details)
  - `created_by` ('smart_ai' or 'contractor_user')
  - `user_id` (if manual action)

**Event Types:**
- 🔵 Lead Activity: new_email_received, homeowner_replied, lead_marked_hot/warm/cold, etc.
- 🟢 Insurance Activity: claim_filed_detected, adjuster_assigned, claim_approved, etc.
- 🟠 Proposal & Estimate Activity: estimate_generated, proposal_created, proposal_emailed_to_homeowner, etc.
- 🟣 Adjuster Communications: supplement_request_sent, adjuster_followup_sent, etc.
- 🟡 CRM / Job Stage Updates: stage_new_lead, stage_claim_filed, stage_install_ready, etc.
- 🔴 High-Urgency Warnings: adjuster_unresponsive_72h, homeowner_replied_waiting, etc.

**Indexes:**
- Fast queries by lead, job, thread, campaign, event type, created_at
- Special index for urgency events

**RLS Policies:**
- Users can read events for their campaigns/workspaces
- Service role and system can insert events
- Users can insert their own events

**Helper Functions:**
- `log_activity_feed_event()` - Base logging function (called via RPC)
- `get_activity_feed()` - Fetch events with flexible filtering
- `generate_activity_summary()` - AI summary when 6+ events in 24h

**Triggers:**
- Auto-logs stage changes when `roofing_jobs.current_stage` changes

### 2. Helper Library ✅
**File**: `lib/roofing-activity-feed.ts`

**Functions:**
- `logRoofingActivity()` - Base logging function
- `RoofingActivityLogger` - Convenience functions for common events:
  - `logNewEmailReceived()`
  - `logHomeownerReplied()`
  - `logLeadMarkedHot()`
  - `logClaimFiled()`
  - `logAdjusterAssigned()`
  - `logClaimApproved()`
  - `logEstimateGenerated()`
  - `logProposalSent()`
  - `logSupplementRequestSent()`
  - `logAdjusterFollowupSent()`
  - `logStageChange()`
  - `logAdjusterUnresponsive()`
  - `logHomeownerRepliedWaiting()`
  - `logInstallReadyNoProposal()`

### 3. API Routes ✅

**GET `/api/inbox/activity-feed`**
- Fetch activity feed events with filtering
- Query params: campaign_id, lead_id, job_id, thread_id, event_types, limit, offset, hours_back
- Returns: Array of activity feed events

**GET `/api/inbox/activity-feed/summary`**
- Generate AI summary for a lead when 6+ events occur in <24 hours
- Query params: lead_id (required), hours_back
- Returns: Summary object with events and suggested action

### 4. UI Component ✅
**File**: `components/inbox/RoofingActivityFeed.tsx`

**Features:**
- Real-time updates via Supabase subscriptions
- Filter by: All, Urgent, Insurance, Proposals, Stages
- Color-coded events by category
- Icons for each event type
- Click handlers for event actions
- Responsive design matching SmartSend UI

**Props:**
- `campaignId`, `leadId`, `jobId`, `threadId` - Filter events
- `eventTypes` - Filter by specific event types
- `limit`, `hoursBack` - Pagination and time window
- `onEventClick` - Callback when event is clicked
- `showFilters` - Toggle filter dropdown

### 5. Real-Time Updates ✅
- Supabase real-time subscription on `activity_feed_events` table
- Auto-refreshes feed when new events are inserted
- Integrated into UI component

### 6. AI Summary Function ✅
- Database function `generate_activity_summary()`
- Triggers when 6+ events occur for a lead in <24 hours
- Generates human-readable summary with suggested actions
- Example: "Daily Summary for Sarah Thompson: Claim approved (RCV $28,500), Estimate generated, Proposal sent, Homeowner replied, Install-ready triggered. Suggested Next Action: Call today and schedule install."

---

## 🔌 Integration Points

### Where to Add Activity Feed Logging

#### 1. Insurance Brain (Block 20360)
**File**: `app/api/inbox/insurance-brain/route.ts`

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// When claim is detected
await RoofingActivityLogger.logClaimFiled({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  carrier: carrier,
  claim_number: claimNumber,
});

// When adjuster is assigned
await RoofingActivityLogger.logAdjusterAssigned({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  adjuster_name: adjusterName,
  carrier: carrier,
});

// When claim is approved
await RoofingActivityLogger.logClaimApproved({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  rcv_total: rcvTotal,
  carrier: carrier,
});
```

#### 2. Proposal Sender (Block 20560)
**File**: `app/api/inbox/proposals/[id]/email/send/route.ts`

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// After proposal email is sent successfully
await RoofingActivityLogger.logProposalSent({
  thread_id: proposal.thread_id,
  job_id: jobId,
  lead_id: thread?.lead_id,
  campaign_id: proposal.campaign_id,
  proposal_value: proposal.total_amount,
  homeowner_name: contact?.first_name + " " + contact?.last_name,
});
```

#### 3. AI Estimator (Block 20490)
**File**: `app/api/inbox/estimates/generate-roofing/route.ts`

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// After estimate is generated
await RoofingActivityLogger.logEstimateGenerated({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  estimate_value: estimate.total_amount,
  homeowner_name: homeownerName,
});
```

#### 4. Adjuster Communication Engine (Block 20590)
**File**: `app/api/inbox/adjuster/send/route.ts`

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// When supplement request is sent
await RoofingActivityLogger.logSupplementRequestSent({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  supplement_value: supplementAmount,
  adjuster_name: adjusterName,
});

// When adjuster follow-up is sent
await RoofingActivityLogger.logAdjusterFollowupSent({
  thread_id: threadId,
  job_id: jobId,
  lead_id: leadId,
  campaign_id: campaignId,
  adjuster_name: adjusterName,
  wait_hours: hoursSinceLastContact,
});
```

#### 5. Inbox Message Handler
**File**: `app/api/inbox/messages/route.ts` or trigger

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// When new email is received
await RoofingActivityLogger.logNewEmailReceived({
  thread_id: message.thread_id,
  lead_id: message.lead_id,
  campaign_id: message.campaign_id,
  homeowner_name: contact?.name,
  subject: message.subject,
});

// When homeowner replies
if (message.direction === 'in') {
  await RoofingActivityLogger.logHomeownerReplied({
    thread_id: message.thread_id,
    lead_id: message.lead_id,
    campaign_id: message.campaign_id,
    homeowner_name: contact?.name,
    message_preview: message.body?.slice(0, 100),
  });
}
```

#### 6. Hot Lead Detection (Block 20430)
**File**: `app/api/inbox/ai-lead-snapshot/route.ts` or similar

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// When lead is marked hot
if (hotScore >= 70) {
  await RoofingActivityLogger.logLeadMarkedHot({
    lead_id: leadId,
    thread_id: threadId,
    campaign_id: campaignId,
    homeowner_name: homeownerName,
    hot_score: hotScore,
  });
}
```

#### 7. Stage Changes (Already Auto-Logged)
- Trigger `trg_log_stage_change` automatically logs stage changes
- No manual integration needed

#### 8. Urgency Warnings
**File**: Create cron job or background worker

```typescript
import { RoofingActivityLogger } from "@/lib/roofing-activity-feed";

// Check for adjuster unresponsive (72+ hours)
// Check for homeowner replied waiting
// Check for install-ready but no proposal
```

---

## 📍 Where to Display Activity Feed

### 1. Dashboard Main "Activity" Page
**File**: `app/(dashboard)/inbox/page.tsx` or new page

```tsx
import { RoofingActivityFeed } from "@/components/inbox/RoofingActivityFeed";

<RoofingActivityFeed
  campaignId={campaignId}
  limit={50}
  hoursBack={24}
  showFilters={true}
  onEventClick={(event) => {
    // Navigate to thread/job
    router.push(`/inbox/${event.thread_id}`);
  }}
/>
```

### 2. Inbox Sidebar (Per Homeowner)
**File**: `components/inbox/LeadInfoPanel.tsx` or similar

```tsx
import { RoofingActivityFeed } from "@/components/inbox/RoofingActivityFeed";

<RoofingActivityFeed
  leadId={leadId}
  threadId={threadId}
  limit={20}
  hoursBack={168} // Last week
  showFilters={false}
/>
```

### 3. Job View (Block 20620)
**File**: `components/inbox/JobView.tsx` or similar

```tsx
import { RoofingActivityFeed } from "@/components/inbox/RoofingActivityFeed";

<RoofingActivityFeed
  jobId={jobId}
  threadId={threadId}
  limit={30}
  hoursBack={168} // Last week
  showFilters={true}
/>
```

---

## 🧪 Testing

### Manual Testing Checklist

1. **Database Migration**
   - [ ] Run migration successfully
   - [ ] Verify `activity_feed_events` table exists
   - [ ] Verify RLS policies work
   - [ ] Test `log_activity_feed_event()` function
   - [ ] Test `get_activity_feed()` function
   - [ ] Test `generate_activity_summary()` function

2. **Helper Library**
   - [ ] Test `logRoofingActivity()` function
   - [ ] Test all `RoofingActivityLogger` convenience functions
   - [ ] Verify events are logged correctly

3. **API Routes**
   - [ ] Test GET `/api/inbox/activity-feed` with various filters
   - [ ] Test GET `/api/inbox/activity-feed/summary`
   - [ ] Verify authentication works
   - [ ] Verify RLS policies are enforced

4. **UI Component**
   - [ ] Verify feed displays events correctly
   - [ ] Test real-time updates
   - [ ] Test filters work
   - [ ] Test click handlers
   - [ ] Verify styling matches SmartSend design

5. **Integration**
   - [ ] Add logging to Insurance Brain
   - [ ] Add logging to Proposal Sender
   - [ ] Add logging to AI Estimator
   - [ ] Add logging to Adjuster Engine
   - [ ] Add logging to Inbox Message Handler
   - [ ] Verify stage change trigger works

---

## 🚀 Next Steps

1. **Integrate event logging** into existing systems (see Integration Points above)
2. **Add urgency detection** cron job for warnings
3. **Create dashboard page** for global activity feed
4. **Add activity feed to job view** (Block 20620)
5. **Add activity feed to inbox sidebar** (per homeowner)
6. **Test end-to-end** with real roofing workflows
7. **Monitor performance** and optimize queries if needed

---

## 📝 Notes

- Activity feed events are best-effort logging (won't break app if logging fails)
- Real-time subscriptions use Supabase channels
- AI summary triggers automatically when 6+ events occur in 24h
- Stage changes are auto-logged via database trigger
- All events include flexible JSONB payload for future extensibility

---

## 🎉 Summary

Block 20680 creates a **mission control center** for roofing operations by:
- ✅ Tracking all SmartSend events in one place
- ✅ Providing real-time updates
- ✅ Generating AI summaries for busy leads
- ✅ Highlighting urgent actions
- ✅ Making it easy to see what's happening across all jobs

This is EXACTLY what roofing companies need to run clean, fast, profitable operations.
















































