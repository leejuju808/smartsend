# Block 19990 — SmartSend Inbox Call Intelligence v1 Implementation

## ✅ Implementation Complete

The AI Call Intelligence Layer for SmartSend Inbox that captures, analyzes, and automates actions based on phone calls.

## 📦 What Was Implemented

### 1. Database Migration ✅
**File**: `supabase/migrations/20250130000001_block19990_call_intelligence_v1.sql`

**Core Table: `call_transcripts`**
- Stores call transcripts, metadata, and AI-processed intelligence
- Links to `workspace_id`, `thread_id`, `contact_id`, `lead_id`
- Captures call metadata: caller number, direction, duration, timestamp
- Stores transcription and audio URL
- Tracks AI processing status for summary, intent, and outcome

**AI-Generated Fields:**
- **Call Summary**: Main summary, homeowner concern, job type, severity, urgency
- **Insurance Info**: Involvement flag, claim number, insurance company
- **Next Steps**: Array of identified next steps
- **Key Questions**: Questions asked during call
- **Objections**: Objections raised
- **Timeline**: Timeline mentioned by homeowner

**Intent Extraction:**
- Structured JSONB `intents` field: appointment_request, price_request, insurance_question, etc.
- Structured JSONB `extracted_info` field: address, email, preferred_time, availability, claim_status, deductible_amount

**Call Outcome Detection:**
- 15+ outcome types: appointment_scheduled, estimate_requested, insurance_mentioned, storm_damage_confirmed, interested, hesitation, not_interested, etc.
- Confidence score (0-100) for outcome detection

**Pipeline Automation:**
- Tracks pipeline actions taken
- Stores pipeline stage before/after call
- Auto-moves leads through pipeline based on call outcomes

**Revenue Intelligence:**
- Estimated job value
- Job potential score (0-100)
- Insurance approval likelihood (0-100)
- Replacement probability (0-100)
- Urgency score (0-100)
- Sentiment (positive, neutral, negative)

**Call Coaching:**
- Array of AI-generated coaching tips
- Helps owners improve sales skills automatically

**Database Functions:**
1. `process_call_summary(p_call_id)` - Processes call summary generation
2. `extract_call_intents(p_call_id)` - Extracts structured intents
3. `detect_call_outcome(p_call_id)` - Detects call outcome
4. `create_tasks_from_call(p_call_id)` - Auto-creates tasks based on call
5. `auto_move_pipeline_from_call(p_call_id)` - Auto-moves pipeline stages
6. `evaluate_call_revenue(p_call_id)` - Evaluates revenue intelligence
7. `generate_call_coaching(p_call_id)` - Generates coaching tips

**Views:**
- `call_history_summary` - View for displaying call history in thread detail

**RLS Policies:**
- Row-level security enabled
- Users can only access calls from their workspace

### 2. API Endpoints ✅

#### POST `/api/calls/ingest`
- Ingests call transcript data from VoIP provider or mobile forwarding
- Creates `call_transcript` record
- Triggers AI processing asynchronously
- **Request Body:**
  ```json
  {
    "workspace_id": "uuid",
    "thread_id": "uuid (optional)",
    "contact_id": "uuid (optional)",
    "lead_id": "uuid (optional)",
    "caller_number": "string",
    "called_number": "string (optional)",
    "call_direction": "inbound|outbound",
    "duration_seconds": number,
    "call_timestamp": "ISO string",
    "audio_url": "string (optional)",
    "transcription": "string"
  }
  ```

#### GET `/api/calls/thread/[threadId]`
- Returns call history for a specific thread
- Includes all call metadata, summaries, outcomes, and intelligence
- **Response:**
  ```json
  {
    "success": true,
    "calls": [...],
    "count": number
  }
  ```

#### POST `/api/calls/[id]/process`
- Manually trigger AI processing for a call transcript
- Useful for reprocessing or testing

### 3. AI Processing Logic ✅
**File**: `app/api/calls/process-utils.ts`

**Processing Pipeline:**
1. **Generate Call Summary** - Roofing-tuned AI summary extraction
2. **Extract Intents** - Structured intent extraction (appointment_request, price_request, etc.)
3. **Detect Call Outcome** - AI outcome detection with confidence scores
4. **Update Call Transcript** - Store all AI results
5. **Evaluate Revenue Intelligence** - Calculate job value, potential, insurance likelihood
6. **Generate Coaching Tips** - AI coaching tips for owner
7. **Auto-Create Tasks** - Create tasks based on call outcomes
8. **Auto-Move Pipeline** - Move leads through pipeline automatically

**AI Models Used:**
- OpenAI GPT-4o-mini for cost-effective, fast processing
- JSON mode for structured output
- Temperature 0.2-0.3 for consistent results

### 4. Automatic Task Creation ✅

Tasks are automatically created based on call outcomes:

- **Appointment Requested** → "Schedule inspection appointment" (high priority, due in 1 day)
- **Estimate Requested** → "Send estimate details" (high priority, due in 2 hours)
- **Insurance Mentioned** → "Prepare insurance documentation" (high priority, due in 1 day)
- **Call Back Later** → "Follow up call" (medium priority, due in 24 hours)
- **Next Steps Array** → Individual tasks for each next step (medium priority, due in 2 days)

All tasks are:
- Auto-generated with `auto_source: 'call_intelligence'`
- Linked to contact/lead
- Include call metadata in task metadata
- Properly prioritized based on urgency

### 5. Pipeline Automation ✅

Pipeline stages are automatically moved based on call outcomes:

- **Appointment Scheduled/Requested** → `estimate_scheduled`
- **Estimate Requested/Pricing Discussed** → `contacted` (stays, adds follow-up)
- **Storm Damage Confirmed** → `contacted` (high priority, insurance workflow if applicable)
- **Insurance Mentioned** → `contacted` (triggers insurance workflow)
- **Interested** → `contacted` (marked as interested)
- **Not Interested** → `lost`
- **Hesitation/Thinking About It** → Stays in current stage, adds follow-up task

Pipeline actions are tracked in `pipeline_action_taken` array.

### 6. Revenue Intelligence ✅

AI evaluates calls for:
- **Job Potential Score** (0-100) - Based on outcome, urgency, interest signals
- **Insurance Approval Likelihood** (0-100) - If insurance involved
- **Replacement Probability** (0-100) - Based on job type
- **Urgency Score** (0-100) - Based on urgency level
- **Estimated Job Value** - Rough estimate based on job type
- **Sentiment** - Positive, neutral, or negative

Results update thread `thread_estimated_value` and `close_probability_score`.

### 7. Call Coaching ✅

AI generates coaching tips after each call:

- "You didn't ask for photos — recommend asking ASAP"
- "Homeowner mentioned insurance — trigger insurance workflow"
- "They asked about pricing — send estimate ranges"
- "They said 'I'll think about it' — follow up in 24 hours"
- "Appointment requested — send calendar link immediately"
- "High urgency mentioned — clarify timeline"

Tips help owners improve sales skills automatically.

### 8. UI Component ✅
**File**: `components/inbox/CallHistoryTab.tsx`

**Features:**
- Displays all calls for a thread
- Shows call summary, outcome, job type, severity, urgency
- Displays insurance involvement
- Shows revenue intelligence (estimated value, job potential)
- Lists pipeline actions taken
- Displays coaching tips
- Beautiful card-based layout with badges and icons
- Responsive design

**Usage:**
```tsx
import { CallHistoryTab } from '@/components/inbox/CallHistoryTab'

<CallHistoryTab threadId={threadId} />
```

## 🚀 Integration Guide

### Adding Call History to Thread Detail

1. **Import the component:**
```tsx
import { CallHistoryTab } from '@/components/inbox/CallHistoryTab'
```

2. **Add as a tab or section:**
```tsx
<Tabs defaultValue="messages">
  <TabsList>
    <TabsTrigger value="messages">Messages</TabsTrigger>
    <TabsTrigger value="calls">📞 Calls</TabsTrigger>
  </TabsList>
  
  <TabsContent value="messages">
    {/* Messages */}
  </TabsContent>
  
  <TabsContent value="calls">
    <CallHistoryTab threadId={threadId} />
  </TabsContent>
</Tabs>
```

### Ingesting Calls from VoIP Provider

**Example webhook handler:**
```typescript
// In your VoIP webhook handler
export async function POST(req: Request) {
  const { callData } = await req.json()
  
  // Call SmartSend API
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/calls/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: workspaceId,
      thread_id: threadId, // If you can match to thread
      contact_id: contactId, // If you can match to contact
      caller_number: callData.from,
      called_number: callData.to,
      call_direction: callData.direction,
      duration_seconds: callData.duration,
      call_timestamp: callData.timestamp,
      audio_url: callData.audioUrl,
      transcription: callData.transcription, // From provider or your transcription service
    }),
  })
}
```

## 📊 Data Flow

1. **Call Completed** → VoIP provider sends webhook
2. **Ingest API** → Creates `call_transcript` record
3. **AI Processing** → Generates summary, extracts intents, detects outcome
4. **Revenue Evaluation** → Calculates job potential, insurance likelihood
5. **Coaching Generation** → Creates coaching tips
6. **Task Creation** → Auto-creates tasks based on outcomes
7. **Pipeline Movement** → Auto-moves leads through pipeline
8. **UI Display** → Call history appears in thread detail

## 🎯 Key Benefits

✅ **Zero Forgetting** - Every call detail is captured and stored
✅ **AI Summaries** - Instant understanding of call content
✅ **Automatic Tasks** - No manual task creation needed
✅ **Pipeline Automation** - Leads move automatically based on outcomes
✅ **Revenue Intelligence** - Job value and potential tracked automatically
✅ **Call Coaching** - Owners improve sales skills automatically
✅ **Full History** - Complete call documentation in thread detail

## 🔧 Configuration

No additional configuration needed. The system works out of the box once:
1. Database migration is applied
2. API endpoints are deployed
3. VoIP provider is configured to send webhooks

## 📝 Next Steps

1. **Integrate VoIP Provider** - Set up webhook to call `/api/calls/ingest`
2. **Add Call History Tab** - Integrate `CallHistoryTab` component into thread detail view
3. **Test Call Ingestion** - Send test call data to verify processing
4. **Monitor AI Processing** - Check `ai_summary_status`, `ai_intent_status`, `ai_outcome_status` fields
5. **Review Coaching Tips** - Use coaching tips to improve sales process

## 🐛 Troubleshooting

**Calls not appearing:**
- Check `workspace_id` matches user's workspace
- Verify RLS policies allow access
- Check API endpoint logs for errors

**AI processing not completing:**
- Check OpenAI API key is set
- Verify `OPENAI_API_KEY` environment variable
- Check `ai_summary_status` field for error status
- Review API logs for processing errors

**Tasks not created:**
- Verify `create_tasks_from_call` function exists
- Check `tasks_v3` table exists
- Verify workspace_id is valid

**Pipeline not moving:**
- Check `auto_move_pipeline_from_call` function exists
- Verify thread exists and has valid `pipeline_stage`
- Check `pipeline_action_taken` array for actions

## 📚 Related Blocks

- Block 19610 - Inbox Data Model (threads, messages)
- Block 18100 - Tasks System v3 (task creation)
- Block 16300 - Pipeline v2 (pipeline stages)
- Block 19920 - Revenue View (revenue tracking)
- Block 19950 - Pipeline Automation (auto-movement)

