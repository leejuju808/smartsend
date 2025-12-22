# Block 264800 — SmartSend Follow-Up Autopilot v1 (Scale Feature #1)

**One job:** make it impossible for roofers to miss money because they forgot to follow up.

This block packages existing SmartSend infrastructure (scheduler, follow-up brain, revenue engine, notifications) into one opinionated feature:

- **Default follow-up sequence** that runs automatically
- **Simple lead states** so owners always know what’s happening
- **Instant hot lead alerts** when money shows up
- **ROI counter** that proves this is paying for itself
- **Plan gating** that makes Growth the obvious upgrade from Starter

No extra knobs. No complexity. Just a money recovery system.

---

## 1. Core Concept

**SmartSend Follow-Up Autopilot v1**:

- Automatically follows up with homeowners **until they reply, book, or say no**
- Runs on top of the existing **send queue + roofing follow-up brain**
- Tracks a simple **lead follow-up state** for every active opportunity
- Surfaces **“recovered by Autopilot”** wins and revenue in the dashboard

> Starter = manual follow-ups only  
> Growth+ = Follow-Up Autopilot on every qualified lead

---

## 2. Data Model

### 2.1 Follow-Up State (Per Lead / Contact)

We do **not** introduce a brand-new state engine; we **standardize on one view** over existing tables so every lead is always in ONE of four follow-up states:

- `waiting_on_homeowner`
- `hot`
- `cold`
- `closed_not_interested`

#### 2.1.1 View: `followup_autopilot_states`

**File:** `supabase/migrations/20250215000001_block_264800_followup_autopilot_v1.sql`

Create a view that maps existing data into the 4 states:

- Source tables:
  - `contacts` / `leads` (core lead record)
  - `roofing_followup_states` (Block 21705)
  - `lead_intent_classifications` (Block 21925)
  - `lead_status_events` / `pipeline_status` (existing status brain)

**Columns:**
- `workspace_id`
- `lead_id` (or `contact_id`, whichever is canonical)
- `current_state` (`waiting_on_homeowner` | `hot` | `cold` | `closed_not_interested`)
- `has_active_autopilot` (bool)
- `last_autopilot_step` (int, 0–4)
- `last_autopilot_sent_at` (timestamptz)
- `next_autopilot_at` (timestamptz)
- `last_reply_at` (timestamptz)
- `last_reply_intent` (`hot` | `warm` | `not_interested` | `neutral` | null)

**State mapping rules (simplified):**

- `hot` when:
  - Latest reply intent from intent classifier is `hot`
  - OR pipeline status is in a “hot / estimate requested / ready to sign” bucket
- `closed_not_interested` when:
  - Latest reply intent is `not_interested`
  - OR lead status is moved to a “lost / unqualified / do not contact” bucket
- `cold` when:
  - No reply and `roofing_followup_states.status = 'cold_lead'`
  - OR `last_message_at` older than 14 days and no open active job
- `waiting_on_homeowner` for all other leads where:
  - There is an open estimate / proposal / active pipeline entry
  - And we have sent at least one message in this opportunity

> The **view is the single source of truth** for the Autopilot UI. We keep underlying engines (intent, pipeline, follow-up brain) unchanged and just map them into simple states.

---

### 2.2 Autopilot Sequence Metadata

We attach a lightweight metadata table to connect leads to the **default follow-up sequence**.

#### Table: `followup_autopilot_enrollments`

**Columns:**
- `id` (uuid, PK)
- `workspace_id`
- `lead_id`
- `source_type` (`estimate_sent` | `proposal_sent` | `manual_enroll`)
- `initial_message_sent_at` (timestamptz)
- `status` (`active` | `stopped` | `completed` | `suppressed`)
- `current_step` (int, 0–4)
- `next_followup_at` (timestamptz)
- `last_followup_sent_at` (timestamptz)
- `last_outcome` (`none` | `replied` | `booked` | `not_interested`)
- `last_outcome_at` (timestamptz)
- `plan_snapshot` (`starter` | `growth` | `domination`) – used for ROI attribution later

**Indexes:**
- `(workspace_id, status, next_followup_at)` – for efficient cron scanning
- `(lead_id, status)` – for state lookups

**RLS:**
- Standard workspace-based RLS: only users in the same workspace can access enrollments.

---

### 2.3 ROI Tracking

We want to show:

- **Recovered Leads (30 days)** – count of leads where Autopilot directly led to a reply/booking
- **Estimated Revenue Saved** – sum of estimated job value for those leads

#### Table: `followup_autopilot_roi_events`

**Columns:**
- `id` (uuid, PK)
- `workspace_id`
- `lead_id`
- `enrollment_id`
- `event_type` (`recovered_lead`)
- `detected_at` (timestamptz)
- `estimated_value_min` (numeric)
- `estimated_value_max` (numeric)
- `estimated_value_source` (`contacts`, `revenue_engine`)

**Logic:**

- Insert a `recovered_lead` event when ALL are true:
  1. Lead is in `followup_autopilot_enrollments` with `status = 'active'`
  2. Lead was in `waiting_on_homeowner` or `cold` state
  3. A homeowner reply arrives **within 14 days** after at least one Autopilot follow-up was sent
  4. Reply intent is `warm` or `hot` **OR** a booking/estimate is recorded within 24h of reply
- Revenue estimate is pulled from:
  - `contacts.estimated_value_min/max` if present (Block 14400)
  - Else `calculate_contact_revenue(lead_id)` function

---

## 3. Follow-Up Sequence Logic

### 3.1 Default Sequence (v1)

Autopilot uses a **single, hard-coded sequence** (templates editable later):

- **Day 2 → Follow-Up #1** – Friendly check-in
- **Day 5 → Follow-Up #2** – “Just circling back”
- **Day 8 → Follow-Up #3** – Value reminder
- **Day 12 → Follow-Up #4** – Final nudge / close the loop

Stops instantly when:

- Homeowner replies (any content)
- Appointment booked / job advanced beyond initial stage
- Lead marked dead / not interested / do not contact

> No branching, no custom logic, no UI complexity. One default Autopilot sequence that “just works”.

---

### 3.2 Templates

We reuse the existing **roofing follow-up template** infrastructure and add a preset set for Autopilot.

- Extend `roofing_followup_templates`:
  - Add `context` column: `campaign` | `autopilot`
  - Insert 4 default rows where `context = 'autopilot'`, `followup_step` = 1–4

**Tone rules:**

- Short (under ~45–60 words)
- Polite, professional, local
- No spammy language or pressure wording
- Example style:
  - “Hey John — just making sure you saw the estimate I sent over. Happy to answer any questions.”

The actual copy lives in the migration insert statements for fast changes.

---

## 4. Engine & Scheduling

### 4.1 Edge Function: `followup-autopilot-v1`

**File:** `supabase/functions/followup-autopilot-v1/index.ts`

Runs every hour and is deliberately simple.

**Steps:**

1. **Stop Rules First**
   - Join enrollments with latest reply + pipeline state
   - If:
     - Reply exists OR
     - Intent is `not_interested` OR
     - Lead is moved to closed / unqualified
   - → Set `status = 'stopped'`, `last_outcome` accordingly, and skip sending

2. **Process Hot Leads**
   - If reply intent is `hot`:
     - Mark `current_state = 'hot'` via underlying status engine
     - Trigger hot lead alerts (see section 5)

3. **Send Due Follow-Ups**
   - Select from `followup_autopilot_enrollments`:
     - `status = 'active'`
     - `next_followup_at <= now()`
     - `current_step < 4`
   - For each enrollment:
     - Load matching template (`context = 'autopilot'`, `followup_step = current_step + 1`)
     - Enqueue an email into **existing `send_queue`**:
       - `step_label = 'autopilot-followup-<n>'`
       - `sequence_step = current_step + 1`
     - Update:
       - `current_step = current_step + 1`
       - `last_followup_sent_at = now()`
       - `next_followup_at = initial_message_sent_at + interval 'X days'` based on step:
         - Step 1: `+ 2 days`
         - Step 2: `+ 5 days`
         - Step 3: `+ 8 days`
         - Step 4: `+ 12 days`

4. **Mark Cold Leads**
   - When `current_step = 4`, `status = 'active'`, and no reply for 14+ days:
     - Mark underlying `roofing_followup_states.status = 'cold_lead'`
     - Enrollment `status = 'completed'`, `last_outcome = 'none'`

5. **ROI Events**
   - For any enrollment where:
     - Previous state ∈ (`waiting_on_homeowner`, `cold`)
     - New state ∈ (`hot`) OR booking event recorded
   - Insert `followup_autopilot_roi_events` row.

### 4.2 CRON Configuration

**`supabase/config.toml`:**

```toml
[cron.jobs."followup-autopilot-v1"]
schedule = "0 * * * *"   # every hour
endpoint = "/functions/v1/followup-autopilot-v1"
```

---

## 5. Hot Lead Alerts (Money Mode)

When a homeowner replies to an Autopilot message:

1. **Reply Detection**
   - Existing reply classifier (Block 20990, 21925) determines intent
   - If `intent = 'hot'`:
     - Flag lead as `hot` in lead status brain

2. **Alert Routing**
   - Use existing notification system (Blocks 13400, 17700):
     - Create `notification` record:
       - `type = 'followup_autopilot_hot_lead'`
       - `lead_id`, `workspace_id`, `message_preview`
     - Target:
       - Lead owner (primary estimator / salesperson)
       - Workspace owner as fallback

3. **UI Surfacing**
   - Inbox / lead card:
     - Add small `AUTOPILOT` badge on threads where last message was sent by Autopilot
     - Highlight replies from those threads with a “🔥 Hot Lead from Autopilot” label

No new complex settings. Alerts follow existing notification preferences.

---

## 6. UI & Experience

### 6.1 Lead Detail: Follow-Up State Pill

**Files (high-level):**
- `components/leads/LeadSidebar.tsx` (or equivalent)

Add a **“Follow-Up Autopilot”** card:

- Shows one of:
  - **⏳ Waiting on homeowner**
  - **🔥 Hot lead**
  - **❄️ Cold**
  - **❌ Closed / Not interested**
- Shows a simple subline:
  - “Autopilot is following up for you” (Growth+)
  - “Manual follow-ups only on this plan” (Starter)

No deep config. One toggle:

- Growth+:
  - `Autopilot: ON/OFF` (per-lead switch, default ON)
- Starter:
  - Disabled toggle with copy:
    - “Automatic follow-ups are a Growth feature. You’re currently on Starter.”

### 6.2 Dashboard ROI Widget

Add a small **Follow-Up Autopilot ROI** card to the main dashboard:

- **Recovered Leads (Last 30 Days)** – uses `followup_autopilot_roi_events`
- **Estimated Revenue Saved** – sum of `estimated_value_min/ max` ranges
- Short explainer:
  - “These are jobs you would likely have missed without SmartSend Autopilot.”

This lives alongside existing revenue engine widgets, but stays extremely simple.

---

## 7. Plan Gating & Billing

### 7.1 Plan Rules

- **Starter:**
  - `followup_autopilot_enrollments` **not created automatically**
  - Manual follow-ups only (existing tools still work)
  - UI shows **what they’re missing** + upgrade CTA

- **Growth & Domination:**
  - Autopilot is **enabled by default** for all new qualified leads
  - Owners can toggle Autopilot OFF per lead, but cannot break the sequence logic

### 7.2 Enforcement

Use existing plan/feature gating utilities (same pattern as Sequence Builder & Conditions):

- Backend:
  - When creating `followup_autopilot_enrollments`, check `workspace.plan`
  - If `Starter` → do nothing, return success with `"autopilotDisabledByPlan": true`
- Frontend:
  - Hide Autopilot toggle in Starter, replace with “Upgrade to turn this on”
  - In Growth+, show the toggle and state pill

---

## 8. Enrollment Triggers

Autopilot should feel like it “just happens” when it matters.

### 8.1 Automatic Enrollment

Create an enrollment when ANY of these occur (Growth+ only):

- An estimate is sent (Block 20010/20020/20490/20560)
- A proposal email is sent with a pricing link
- A job is moved into a “estimate_sent / proposal_sent / follow_up_needed” stage

Implementation:

- Add small hooks in the relevant API routes / triggers:
  - Call `create_followup_autopilot_enrollment(workspace_id, lead_id, initial_message_sent_at, source_type)`
  - If enrollment already exists and is active, no-op

### 8.2 Manual Enrollment Button

On the lead sidebar:

- Button: **“Turn on Follow-Up Autopilot”** (Growth+)
- Calls same helper:
  - `source_type = 'manual_enroll'`

---

## 9. Success Criteria & Guardrails

### 9.1 V1 Acceptance Criteria

- ✅ Every qualified lead in Growth+ has **one clear follow-up state** (view-backed)
- ✅ Autopilot sends up to 4 follow-up messages at **Days 2, 5, 8, 12**
- ✅ All follow-ups **stop instantly** on:
  - Any reply
  - Booking / appointment creation
  - Marked as not interested / closed
- ✅ Hot replies trigger **visible hot lead alerts**
- ✅ Dashboard shows:
  - “Recovered Leads (30 days)”
  - “Estimated Revenue Saved”
- ✅ Starter customers:
  - See what Autopilot would do
  - Cannot enable it without upgrading

### 9.2 7-Day Real-World Success Criteria

This feature is a win if, within 7 days on real accounts:

- ✔ At least **1 lead recovered per active account** (via ROI event)
- ✔ Owners say some version of **“this saved us”**
- ✔ At least **2 Starter → Growth upgrades** are directly attributed to Autopilot
- ✔ **Zero complaints** about spammy follow-ups or confusing behavior

If not:

- **Tighten message copy and schedule** (tone, spacing)  
- **Do not** add complexity or knobs. Keep it simple and more human.

---

## 10. Testing Checklist

- [ ] Migration for `followup_autopilot_enrollments`, `followup_autopilot_roi_events`, and `followup_autopilot_states` view runs cleanly
- [ ] Edge function `followup-autopilot-v1` deploys and runs hourly
- [ ] New estimates/proposals in Growth+ auto-enroll into Autopilot
- [ ] Follow-ups send at days 2,5,8,12 via existing `send_queue`
- [ ] Replies immediately stop future follow-ups
- [ ] Hot replies create notifications and visually mark the lead as 🔥
- [ ] ROI widget shows recovered leads + estimated revenue saved
- [ ] Starter workspaces never create enrollments and see clear upgrade messaging

When all of the above are true, **Follow-Up Autopilot v1 is ready to roll out as SmartSend’s first true scale feature.**












