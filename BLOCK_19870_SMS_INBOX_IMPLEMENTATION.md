# Block 19870 — Inbox Real-Time SMS + Texting Pipeline v1

## Overview

This block enables two-way SMS communication inside SmartSend Inbox. Each workspace gets a dedicated phone number, SMS messages are unified with email in threads, AI generates short texting-optimized drafts, and SMS booking flows are supported.

## What Was Built

### 1. Database Schema

#### Phone Number Assignment
- **workspace_settings.settings.sms**: JSONB field storing SMS configuration
  - `phone_number`: Dedicated SmartSend phone number for workspace
  - `provider`: SMS provider (twilio, nexmo, telnyx)
  - `credentials`: Provider credentials (stored securely)
  - `auto_reply_enabled`: Enable/disable auto-replies
  - `business_hours`: Business hours for auto-reply logic
  - `after_hours_message`: Message to send after hours

#### SMS Channel Support in Inbox
- **inbox_messages.channel**: Enum type (`email` | `sms`)
- **inbox_messages.from_phone**: Phone number sender (for SMS)
- **inbox_messages.to_phone**: Phone number recipient (for SMS)
- **inbox_messages.sms_provider_message_id**: Provider message ID (Twilio SID)
- **inbox_messages.sms_delivery_status**: Delivery status (`queued`, `sent`, `delivered`, `failed`, `read`)
- **inbox_threads.last_channel**: Last channel used in thread (`email` | `sms`)

#### SMS Delivery Tracking
- **sms_delivery_logs**: Tracks SMS delivery status updates from Twilio webhooks
  - Links to `inbox_messages` via `message_id`
  - Stores provider response for debugging
  - Tracks status changes over time

#### SMS Compliance
- **sms_opt_outs**: Tracks SMS opt-outs for compliance
  - Detects STOP, UNSUBSCRIBE keywords automatically
  - Prevents sending SMS to opted-out numbers
  - Links to contacts for easy management
- **contacts.sms_opt_out**: Boolean flag for quick opt-out checks

#### SMS Booking Flow
- **sms_booking_attempts**: Tracks SMS-based appointment booking
  - Detects booking intent from messages
  - Stores proposed times
  - Tracks confirmation status

#### SMS QA & Logging
- **sms_qa_logs**: Logs SMS messages for QA and compliance
  - Similar to email QA logs
  - Tracks AI intent classification
  - Flags messages for review

### 2. API Endpoints

#### `/api/inbox/sms/inbound` (POST)
**Purpose**: Handle inbound SMS webhook from Twilio

**Features**:
- Receives Twilio webhook (form data)
- Maps incoming number to workspace via `workspace_settings`
- Checks opt-out status before processing
- Creates/finds contact by phone number
- Creates/finds inbox thread
- Stores inbound SMS message in `inbox_messages`
- Logs to `sms_qa_logs`
- Returns TwiML XML response

**Request**: Twilio webhook form data
**Response**: TwiML XML

#### `/api/inbox/sms/send` (POST)
**Purpose**: Send SMS from inbox thread

**Request Body**:
```json
{
  "thread_id": "uuid",
  "message": "string",
  "contact_id": "uuid",
  "workspace_id": "uuid"
}
```

**Features**:
- Validates phone number format
- Checks opt-out status
- Gets workspace SMS number and credentials
- Sends via Twilio (or other provider)
- Creates outbound message record
- Updates thread metadata
- Logs to QA logs

**Response**:
```json
{
  "success": true,
  "message_id": "uuid",
  "provider_message_id": "string"
}
```

#### `/api/inbox/sms/delivery-status` (POST)
**Purpose**: Update SMS delivery status from Twilio webhooks

**Features**:
- Receives Twilio status webhook
- Maps Twilio status to internal status
- Updates `inbox_messages.sms_delivery_status`
- Creates `sms_delivery_logs` entry
- Returns success to Twilio

#### `/api/inbox/sms/ai-draft` (POST)
**Purpose**: Generate AI SMS drafts optimized for texting

**Request Body**:
```json
{
  "thread_id": "uuid",
  "intent": "hot" | "warm" | "cold" | "dead" | "follow_up"
}
```

**Features**:
- Gets thread context and recent messages
- Generates short, direct SMS drafts (< 160 chars)
- Uses GPT-4o-mini for generation
- Optimized for texting (no paragraphs, contractions, friendly tone)
- Returns draft text

**Response**:
```json
{
  "draft": "string",
  "intent": "string"
}
```

### 3. Database Functions

#### `get_workspace_sms_number(workspace_id)`
Returns the SMS phone number for a workspace.

#### `is_sms_opted_out(workspace_id, phone_number)`
Checks if a phone number has opted out of SMS for a workspace.

#### `detect_sms_opt_out(message_body)`
Detects opt-out keywords (STOP, UNSUBSCRIBE, etc.) in SMS message body.

#### `set_workspace_sms_number(workspace_id, phone_number, provider, credentials)`
Assigns a phone number to a workspace for SMS functionality.

### 4. Automatic Features

#### Opt-Out Detection
- Trigger automatically detects STOP/UNSUBSCRIBE keywords
- Creates `sms_opt_outs` record
- Updates `contacts.sms_opt_out` flag
- Prevents future SMS sends

#### Thread Channel Tracking
- Automatically updates `inbox_threads.last_channel` when messages are inserted
- Enables unified email + SMS threads

#### Delivery Status Updates
- Webhook endpoint updates message status in real-time
- Tracks delivery status changes over time
- Provides transparency for users

## Usage Examples

### Setting Up SMS for a Workspace

```sql
-- Assign a phone number to a workspace
SELECT set_workspace_sms_number(
  'workspace-uuid',
  '+1234567890',
  'twilio',
  '{"account_sid": "...", "auth_token": "..."}'::jsonb
);
```

### Sending SMS from Inbox

```typescript
// Frontend code
const response = await fetch('/api/inbox/sms/send', {
  method: 'POST',
  body: JSON.stringify({
    thread_id: 'thread-uuid',
    message: 'We can come tomorrow at 10 AM. Does that work?',
    contact_id: 'contact-uuid',
    workspace_id: 'workspace-uuid',
  }),
});
```

### Generating AI SMS Draft

```typescript
// Frontend code
const response = await fetch('/api/inbox/sms/ai-draft', {
  method: 'POST',
  body: JSON.stringify({
    thread_id: 'thread-uuid',
    intent: 'hot',
  }),
});

const { draft } = await response.json();
// draft: "Leak? We can come today. What's your address?"
```

## Integration Points

### Twilio Webhook Setup
1. Configure Twilio webhook URL: `https://yourdomain.com/api/inbox/sms/inbound`
2. Configure status callback: `https://yourdomain.com/api/inbox/sms/delivery-status`
3. Assign phone number to workspace using `set_workspace_sms_number()`

### Frontend Integration
- Add SMS/Email toggle in inbox thread view
- Show SMS messages with phone numbers instead of email addresses
- Display delivery status badges (Sent, Delivered, Read)
- Add SMS composer with character count
- Show opt-out warnings for opted-out contacts

## Next Steps (Future Blocks)

1. **SMS Auto-Reply System**: Implement after-hours and timed auto-replies
2. **SMS Booking Flow**: Detect booking intent and confirm appointments via SMS
3. **SMS Task Automation**: Auto-create tasks from SMS messages
4. **SMS Templates**: Pre-built SMS templates for common scenarios
5. **SMS Analytics**: Track SMS engagement, response rates, etc.

## Notes

- SMS messages are stored in the same `inbox_messages` table as email
- Threads can contain both email and SMS messages (unified view)
- Opt-out detection is automatic and prevents future sends
- Delivery status tracking provides transparency
- AI drafts are optimized for SMS (short, direct, human-sounding)



















































