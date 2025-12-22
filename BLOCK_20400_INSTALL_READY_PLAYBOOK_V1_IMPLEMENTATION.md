# Block 20400 — Install-Ready Playbook v1 Implementation

## 🎯 Mission

This block is where SmartSend officially becomes a roofing closer, not just an email tool.

- **20360** = understands insurance
- **20380** = understands scope + numbers
- **20400** = turns that intelligence into actions that book jobs

**This is the block that makes SmartSend money for contractors.**

---

## ✅ Implementation Complete

### 1. Database Migration (`20250131000001_block20400_install_ready_playbook_v1.sql`)

**Added Fields to `inbox_threads`:**
- `install_ready_playbook_generated` - Whether playbook has been generated
- `install_ready_playbook_generated_at` - Timestamp when playbook was generated
- `install_ready_call_script` - JSONB with full personalized call script
- `install_ready_followup_sequence` - JSONB with email/SMS follow-up sequence
- `install_ready_next_action` - Single clear recommended action
- `install_ready_next_action_priority` - Priority level (HIGH, MEDIUM, LOW)
- `install_ready_playbook_metadata` - JSONB with generation details

**Database Features:**
- Indexes for fast queries on playbook status and priority
- View `inbox_install_ready_needs_playbook` for leads needing playbook generation
- Function `get_install_ready_playbook_summary()` returns complete playbook data
- Trigger `trg_trigger_install_ready_playbook` auto-marks threads for playbook generation

### 2. Supabase Edge Function (`install-ready-playbook-v1/index.ts`)

**Core Generation Logic:**

**A) Trigger Detection**
- Activates when `install_ready == true` from block 20360
- OR when claim is "Approved" and 20380 has parsed scope + deductible
- OR when homeowner expresses interest ("What's the next step?")

**B) Call Script Generator**
Generates personalized roofing-specific script with:
- **Opener**: Uses homeowner's name + reference to claim
- **Proof of Understanding**: Summarizes THEIR claim back to them (builds trust)
- **Installation Readiness Check**: Soft close asking about scheduling preference
- **Supplement Trigger**: Only if missing items found - mentions handling supplements at no cost
- **Close**: Confirms materials delivery and install dates
- **Full Script Text**: Complete script as one continuous text

**C) Follow-Up Sequence Generator**
Generates sequence based on:
- **install_ready**: Day 0 (Email+SMS), Day 1 (Call), Day 3 (SMS), Day 5 (Voicemail), Day 7 (Final call)
- **claim_pending**: Supportive, checking in tone
- **acv_only**: Education-based messages about ACV and recovering depreciation
- **big_deductible**: Focus on payment options, timing flexibility, financing
- **supplement_needed**: Emphasizes handling supplements at no cost

**D) Recommended Action Engine**
Outputs ONE clear instruction:
- "CALL IMMEDIATELY – homeowner is ready to schedule"
- "Gather more info"
- "Send deductible explanation email"
- "Trigger supplement workflow"
- "Follow-up Day 3"
- "Send roofing options PDF"
- "Await homeowner documents"

With priority level: HIGH, MEDIUM, or LOW

**E) Personalization**
Uses:
- Homeowner name
- Contractor name
- Carrier
- Claim status
- Deductible amount
- RCV total
- Roof squares
- Material type
- Missing items (for supplement opportunities)

### 3. API Route (`app/api/inbox/playbook/[threadId]/route.ts`)

**Endpoints:**
- `GET /api/inbox/playbook/[threadId]` - Fetch existing playbook data
- `POST /api/inbox/playbook/[threadId]` - Trigger playbook generation

**Features:**
- Validates thread exists and user has access
- Checks if thread is install-ready before generating
- Calls edge function to generate playbook
- Returns complete playbook data including insurance and scope context

### 4. React Component (`components/inbox/InstallReadyPlaybookCard.tsx`)

**UI Features:**
- Shows playbook summary with insurance context
- Displays next action with priority badge
- Expandable call script section with copy buttons
- Expandable follow-up sequence with copy buttons
- Generate button if playbook not yet created
- Refresh button to reload playbook data
- Only shows for install-ready leads

**Call Script Display:**
- Shows opener, proof of understanding, installation readiness check, supplement trigger (if applicable), and close
- Copy buttons for each section
- Copy full script button

**Follow-Up Sequence Display:**
- Shows all messages with day offset, channel (email/SMS), subject (for email), body, and purpose
- Copy buttons for each message
- Visual indicators for channel type

### 5. Integration (`src/app/inbox/components/ConversationView.tsx`)

**Integration:**
- Added `InstallReadyPlaybookCard` to right sidebar
- Positioned after `InsuranceClaimCard` (logical grouping)
- Passes `conversationId` and `initialInstallReady` props
- Card automatically loads playbook when thread is install-ready

---

## 🧠 How Block 20400 Helps Roofing Companies

**Roofers struggle with:**
- ❌ Knowing what to say
- ❌ Knowing when to follow up
- ❌ Knowing how to close an insurance job
- ❌ Forgetting to follow up
- ❌ Not having a consistent sales system
- ❌ Not understanding ACV/RCV
- ❌ Missing supplements
- ❌ Letting good homeowners go cold

**SmartSend fixes ALL of that:**
- ✅ Generates the perfect call script
- ✅ Creates behavior-based follow-up
- ✅ Pushes install scheduling
- ✅ Gives contractor confidence
- ✅ Makes the homeowner feel taken care of
- ✅ Turns insurance chaos into booked installs

**This directly = more signed contracts, higher revenue, and repeatable sales workflows.**

---

## 📋 Usage Flow

1. **Thread becomes install-ready** (via block 20360 or 20380)
2. **Trigger fires** (automatic via trigger or manual via API)
3. **Edge function generates playbook** using AI
4. **Playbook stored in database** with all scripts and sequences
5. **UI displays playbook** in inbox right sidebar
6. **Contractor uses call script** to close the deal
7. **Follow-up sequence executes** automatically (future enhancement)

---

## 🔮 Future Enhancements

### v2 Features (Future)
- Automatic follow-up sequence execution
- Calendar integration for scheduling pushes
- Voice call script playback
- A/B testing of call scripts
- Performance tracking (close rate by script type)
- Multi-language support
- Integration with CRM systems
- Real-time script updates based on homeowner responses

---

## ✅ Status: READY FOR TESTING

All components of Block 20400 — Install-Ready Playbook v1 have been successfully implemented:

- ✅ Database migration with:
- ✅ Database migration with all playbook fields
- ✅ Edge function for AI-powered playbook generation
- ✅ API endpoints for fetching and generating playbooks
- ✅ React component for displaying playbook in inbox
- ✅ Integration into ConversationView
- ✅ Trigger logic for auto-generation
- ✅ Personalization using insurance and scope data

**This makes SmartSend undeniably valuable, especially for roofers who live off insurance claims.**
















































