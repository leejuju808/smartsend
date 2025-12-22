# Block 130000 — SmartSend AI Voice Assistant Implementation

## Overview

This implementation adds a full AI call-answering pipeline that:
- ✅ Answers calls instantly with AI (no missed calls)
- ✅ Qualifies homeowners through conversational flow
- ✅ Collects homeowner information (name, address, issue, insurance, urgency)
- ✅ Auto-books appointments
- ✅ Creates leads in SmartSend
- ✅ Sends push notifications to roofers
- ✅ Sends SMS confirmations to homeowners

## Implementation Details

### 1. Inbound Call Webhook (`/app/api/voice/inbound/route.ts`)

**Purpose**: Receives Twilio call webhooks and initiates AI conversation

**Features**:
- Parses Twilio webhook form data
- Finds phone number configuration to get user/workspace info
- Creates call log entry
- Uses Twilio's `Gather` with speech recognition for conversational flow
- Processes speech input with OpenAI to generate contextual responses
- Maintains conversation state (greeting → collecting_name → collecting_address → etc.)

**Flow**:
1. Call comes in → Webhook received
2. Check if phone number is configured for AI assistant
3. Start conversation with greeting
4. Use `Gather` to collect speech input
5. Process speech with OpenAI to generate response
6. Continue conversation until all info collected or appointment booked

### 2. Call Completion Handler (`/app/api/voice/call-complete/route.ts`)

**Purpose**: Processes completed calls, extracts lead info, creates leads, books appointments

**Features**:
- Combines conversation transcript with final transcription
- Extracts structured lead information using OpenAI
- Creates lead in database with all collected information
- Auto-books appointment using existing `autoBookAppointment` function
- Sends push notification to roofer
- Sends SMS confirmation to homeowner

**Lead Data Extracted**:
- Name (first_name, last_name)
- Address
- Roof issue description
- Urgency level (urgent/normal/low)
- Insurance status
- Preferred appointment time

### 3. Lead Extraction Function (`/lib/voice/parseCallTranscript.ts`)

**Purpose**: Reusable function to extract structured data from call transcripts

**Features**:
- Uses OpenAI GPT-4o-mini with JSON mode
- Extracts: name, address, issue, urgency, insurance, preferredTime
- Returns structured `ExtractedLeadInfo` object
- Handles errors gracefully

## Integration Points

### Database Tables Used

1. **`call_logs`**: Stores call metadata and transcripts
   - `twilio_call_sid`: Unique call identifier
   - `transcript`: Full conversation transcript
   - `conversation_state`: Current state in conversation flow
   - `captured_name`, `captured_address`, `captured_issue`: Extracted data

2. **`leads`**: Stores created leads
   - `source`: Set to "phone"
   - `phone`: Caller's phone number
   - `first_name`, `last_name`: Extracted name
   - `address`: Full address
   - `custom`: JSONB with issue, urgency, insurance, preferred_time, call_transcript
   - `heat_score`: Set based on urgency (urgent → hot, normal → warm)

3. **`appointments`**: Created via `autoBookAppointment` function
   - Links to lead via `lead_id`
   - Contains homeowner info and scheduled time

### External Services

1. **Twilio**: 
   - Phone number management
   - Call webhooks
   - Speech recognition via `Gather`
   - SMS sending

2. **OpenAI**:
   - GPT-4o-mini for conversation responses
   - GPT-4o-mini for lead extraction (JSON mode)

3. **Supabase Edge Function**:
   - `autoBookAppointment`: Existing function for automatic appointment booking

### Push Notifications

Uses existing `/api/mobile/push/hot-lead` endpoint:
- Sends to all users in workspace
- Includes homeowner name, address, appointment details
- Uses OneSignal or other configured push provider

### SMS Confirmations

Uses existing SMS provider (`@/lib/providers/sms`):
- Sends confirmation message with appointment date/time
- Personalized with homeowner name

## Setup Instructions

### 1. Twilio Configuration

1. Purchase a Twilio phone number
2. Configure webhook URL in Twilio Console:
   - Voice webhook: `https://your-app.com/api/voice/inbound`
   - Method: POST

### 2. Environment Variables

Ensure these are set:
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_APP_URL=https://your-app.com
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Database Setup

Ensure these tables exist:
- `phone_numbers`: Phone number configuration
- `call_logs`: Call logging
- `leads`: Lead storage
- `appointments`: Appointment storage
- `user_push_targets`: Push notification targets

### 4. Phone Number Configuration

In `phone_numbers` table:
- Set `ai_assistant_enabled = true`
- Link to `user_id` or `workspace_id`
- Configure `company_id` if applicable

## Conversation Flow

1. **Greeting**: "Hello! Thank you for calling. I'm SmartSend AI Assistant. How can I help you with your roofing needs today?"

2. **Collecting Name**: "May I have your name, please?"

3. **Collecting Address**: "What's your address?"

4. **Collecting Issue**: "What's happening with your roof?"

5. **Collecting Urgency**: "When do you need this addressed?"

6. **Collecting Insurance**: "Do you have insurance coverage for this?"

7. **Booking**: "What day and time works best for you?"

8. **Confirmation**: "Perfect! I'll have our team confirm the appointment details with you shortly. Thank you for calling!"

## Error Handling

- All routes have try-catch blocks
- Graceful fallbacks (e.g., forward to human if AI fails)
- Logs errors for debugging
- Continues processing even if non-critical steps fail (e.g., push notification failure doesn't block lead creation)

## Future Enhancements

1. **Real-time Streaming**: Upgrade to OpenAI Realtime API + Twilio Media Streams for true real-time conversation
2. **Multi-language Support**: Add language detection and translation
3. **Call Recording**: Store and analyze call recordings
4. **Advanced Qualification**: More sophisticated lead scoring based on conversation
5. **Integration with CRM**: Sync leads to external CRMs
6. **Analytics Dashboard**: Track call metrics, conversion rates, etc.

## Testing

To test the implementation:

1. **Local Testing**: Use ngrok to expose local server to Twilio
2. **Test Call Flow**:
   - Call the Twilio number
   - Verify AI greeting plays
   - Test speech recognition
   - Verify lead creation
   - Check appointment booking
   - Verify notifications sent

3. **Test Scenarios**:
   - Happy path: Full conversation → Lead created → Appointment booked
   - Partial info: Some fields missing → Lead created with available info
   - No booking intent: Conversation ends → Lead created, no appointment
   - Error handling: Network errors → Graceful fallback

## Notes

- Current implementation uses Twilio's `Gather` API which is simpler but has slight latency
- For true real-time (lower latency), consider implementing WebSocket bridge between Twilio Media Streams and OpenAI Realtime API
- The conversation state is stored in `call_logs.conversation_state` for tracking
- All transcripts are stored for audit and improvement purposes


























