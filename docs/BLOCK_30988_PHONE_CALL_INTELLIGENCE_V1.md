# Block 30988 — SmartSend Roofing "SmartPhone → CRM Sync + Call Recording Intelligence" v1

**Sync calls from contractor's actual phone • Auto-log every call • Transcribe voicemails • Detect buying signals • Turn conversations into revenue tasks**

## 🚀 Overview

This feature transforms SmartSend from an "email tool" into a **FULL SERVICE ROOFING SALES ENGINE** by:

1. **Phone Number Masking/Forwarding** - Contractors get a SmartSend number that forwards to their cell
2. **Call Recording + Storage** - Every call is recorded (if legal) and stored
3. **AI Transcription** - Audio is transcribed into clear text
4. **Call Intelligence Engine** - Analyzes transcripts for buying signals, urgency, objections
5. **Auto-task Creation** - Automatically creates follow-up tasks from conversations
6. **Lead Score Boosts** - Updates lead scores based on detected signals

## 📦 Database Schema

### Tables Created

1. **call_recordings** - Stores call recordings and transcriptions
2. **call_insights** - AI-detected buying signals and intelligence
3. **call_tasks** - Auto-generated tasks from call intelligence
4. **call_to_lead_map** - Maps phone calls to leads
5. **lead_score_logs** - Audit log of lead score changes

### Functions Created

- `update_lead_score(p_lead_id, p_delta)` - Updates lead score and logs the change
- `find_lead_by_phone(p_org_id, p_phone)` - Finds lead by phone number
- `auto_map_call_to_lead()` - Automatically maps calls to leads by phone

## 🔧 Setup

### 1. Run Migration

```bash
# Apply the migration
supabase db push

# Or run in Supabase SQL Editor
# File: supabase/migrations/20250130000001_block30988_phone_call_intelligence_v1.sql
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy call-recording-processor
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → call-recording-processor → Settings:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

## 📞 Integration with Twilio/Vonage

### Twilio Webhook Setup

When a call recording is ready, Twilio will POST to your webhook. Create an endpoint that:

1. Receives the recording URL from Twilio
2. Creates a `call_logs` entry
3. Creates a `call_recordings` entry with `recording_url`
4. Triggers the Edge Function to process the recording

### Example Webhook Handler

```typescript
// app/api/webhooks/twilio/recording/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const recordingUrl = formData.get("RecordingUrl") as string;
  const callSid = formData.get("CallSid") as string;
  const from = formData.get("From") as string;
  const to = formData.get("To") as string;

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Create or find call_log entry
  const { data: callLog, error: callError } = await supabase
    .from("call_logs")
    .insert({
      org_id: "your-org-id", // Get from user context
      user_id: "user-id", // Get from user context
      phone: from,
      direction: "inbound",
      outcome: "talked",
    })
    .select()
    .single();

  if (callError) {
    return NextResponse.json({ error: callError.message }, { status: 500 });
  }

  // 2. Create call_recording entry
  const { data: recording, error: recordingError } = await supabase
    .from("call_recordings")
    .insert({
      call_id: callLog.id,
      recording_url: recordingUrl,
      transcription_status: "pending",
    })
    .select()
    .single();

  if (recordingError) {
    return NextResponse.json(
      { error: recordingError.message },
      { status: 500 }
    );
  }

  // 3. Trigger Edge Function to process recording
  const { error: processError } = await supabase.functions.invoke(
    "call-recording-processor",
    {
      body: {
        call_id: callLog.id,
        recording_url: recordingUrl,
      },
    }
  );

  if (processError) {
    console.error("Error processing recording:", processError);
    // Don't fail - recording is saved, can be processed later
  }

  return NextResponse.json({ ok: true });
}
```

## 🎯 Usage

### Manual Processing

If you have a recording URL and want to process it manually:

```typescript
const { data, error } = await supabase.functions.invoke(
  "call-recording-processor",
  {
    body: {
      call_id: "call-uuid",
      recording_url: "https://...",
    },
  }
);
```

### Querying Call Intelligence

```typescript
// Get all insights for a call
const { data: insights } = await supabase
  .from("call_insights")
  .select("*")
  .eq("call_id", callId)
  .order("value", { ascending: false });

// Get auto-generated tasks
const { data: tasks } = await supabase
  .from("call_tasks")
  .select("*")
  .eq("lead_id", leadId)
  .eq("status", "open")
  .order("due_at", { ascending: true });

// Get call recording with transcription
const { data: recording } = await supabase
  .from("call_recordings")
  .select("*")
  .eq("call_id", callId)
  .single();
```

## 📊 Buying Signals Detected

The AI analyzes transcripts for:

- **Buying Signals**: "We're ready", "Let's move forward" → +40 score
- **Urgency**: "ASAP", "as soon as possible" → +30 score
- **Insurance**: "Insurance is covering it" → +20 score
- **Storm Damage**: "Hail damage", "storm hit" → +20 score
- **Price Sensitivity**: "Too expensive" → -20 score, "Getting quotes" → -10 score

## 🔄 Auto-Task Creation Examples

- "We're ready to move forward" → Task: "Call homeowner today to finalize appointment"
- "We need paperwork for the adjuster" → Task: "Email adjuster packet"
- "Call back next Thursday" → Follow-up task scheduled for next Thursday

## 🎨 UI Integration

### Lead Profile — "Call Intelligence" Tab

Display:
- Call timeline
- Each call recording with play button
- Full transcript
- Detected buying signals
- AI summary
- Tasks generated
- Score boosts

### CRM Pipeline

Each lead shows:
- 📞 Number of calls
- 🔊 Recording icon if available
- ⭐ Score incorporating call intelligence

### Call Dashboard Cards

- Calls Today
- Answer Rate
- Missed → Saved Rate
- Tasks Created from Calls
- Revenue from Calls

## 🔒 Security

All tables have RLS (Row Level Security) enabled:
- Users can only view calls/recordings for their organization
- Service role has full access for automation
- All operations are logged

## 🐛 Troubleshooting

### Transcription Fails

- Check that `OPENAI_API_KEY` is set correctly
- Verify the recording URL is accessible
- Check file format (MP3, WAV supported)
- Review Edge Function logs in Supabase Dashboard

### Lead Mapping Not Working

- Ensure phone numbers are normalized consistently
- Check that leads have phone numbers in the database
- Verify `find_lead_by_phone` function is working

### Score Updates Not Applying

- Check that `update_lead_score` function exists
- Verify lead has a valid `score` column
- Review `lead_score_logs` table for errors

## 📈 Next Steps

1. Set up Twilio/Vonage phone number masking
2. Configure webhooks for call recording events
3. Build UI components for call intelligence display
4. Set up scheduled job to process any pending recordings
5. Add call analytics dashboard


































