# Block 34400 — SmartSend Roofing "AI Office Assistant + Inbox Command Center" v1

## ✅ Implementation Complete

This block implements a unified inbox command center for roofing companies with AI-powered intent classification, auto-task creation, and suggested replies.

## 📦 What's Been Built

### 1. Database Schema ✅
**File**: `supabase/migrations/20250130000001_block34400_roofing_inbox_command_center_v1.sql`

Creates three core tables:
- **`inbox_threads`**: One thread per lead, tracks last message, intent, urgency, summary
- **`inbox_messages`**: All messages (email, SMS, webform, voicemail) with AI classification
- **`inbox_tasks`**: Auto-generated tasks from messages (calls, proposals, appointments, emergencies)

Key features:
- Lead-centric threading (not campaign-centric)
- AI intent classification storage
- Urgency detection (urgent vs normal)
- Thread summaries
- Auto-updating thread metadata via triggers
- RLS policies for workspace-based security

### 2. Edge Functions ✅

#### inbox-ingest
**File**: `supabase/functions/inbox-ingest/index.ts`

- Ingests incoming messages from any channel (email, SMS, webform, voicemail)
- Classifies intent using GPT-4o-mini with roofing-specific intents:
  - booking_request
  - price_question
  - warranty_claim
  - leak_emergency
  - schedule_change
  - financing_question
  - ready_to_move_forward
  - send_proposal_again
  - complaint
  - referral
  - not_interested
  - material_question
  - unknown
- Detects urgency (urgent for leaks, emergencies, complaints)
- Auto-creates tasks based on intent (e.g., "Schedule appointment" for booking_request)
- Updates thread metadata automatically

#### inbox-suggest-reply
**File**: `supabase/functions/inbox-suggest-reply/index.ts`

- Generates AI-suggested replies based on:
  - Message intent
  - Thread history (last 3 messages)
  - Lead information (name, email, phone)
- Tailored responses for each intent type
- Short, professional, actionable replies (2-4 sentences)

### 3. API Routes ✅

#### POST `/api/inbox/ingest`
- Public endpoint for ingesting messages (called by webhooks)
- Requires workspace_id in request
- Calls edge function for classification

#### GET `/api/inbox/threads`
- Lists all threads with pagination
- Filters: all, urgent, unread, booking_request, price_question, leak_emergency, etc.
- Search by message content or summary
- Returns intent breakdown counts

#### GET `/api/inbox/threads/[id]`
- Gets full thread detail with all messages
- Includes auto-generated tasks
- Marks thread as read
- Returns lead information

#### POST `/api/inbox/threads/[id]/reply`
- Sends reply in thread
- Creates outbound message
- TODO: Integrate with actual email sending (Resend/Gmail API)

#### POST `/api/inbox/threads/[id]/suggest-reply`
- Gets AI-suggested reply for thread
- Calls edge function

#### POST `/api/inbox/tasks`
- Manually create tasks from messages
- Used by UI for manual task creation

#### GET `/api/inbox/dashboard`
- Response time statistics
- Unread message counts
- Urgent thread counts
- Intent breakdown

### 4. UI Components ✅

#### InboxCommandCenter
**File**: `src/components/inbox/InboxCommandCenter.tsx`

- Main inbox list view
- Dashboard stats cards (total threads, unread, urgent, avg response time)
- Filter buttons (all, urgent, unread, booking requests, etc.)
- Search functionality
- Thread list with:
  - Lead name and contact info
  - Last message preview
  - AI summary
  - Intent badges
  - Urgency indicators
  - Unread count badges

#### ThreadView
**File**: `src/components/inbox/ThreadView.tsx`

- Full conversation view
- Message history (inbound/outbound)
- AI thread summary card
- Auto-generated tasks list
- Reply composer with:
  - AI suggested reply button
  - Suggested reply preview
  - Subject line input
  - Quick task creation buttons
- Intent and urgency badges
- Lead information header

### 5. Pages ✅

- `/dashboard/inbox-command-center`: Main inbox page
- `/dashboard/inbox-command-center/[id]`: Individual thread view

## 🚀 Setup Instructions

### 1. Database Migration

Run the migration in Supabase SQL Editor or via CLI:

```bash
supabase migration up
```

Or manually run:
```sql
-- File: supabase/migrations/20250130000001_block34400_roofing_inbox_command_center_v1.sql
```

### 2. Deploy Edge Functions

```bash
cd supabase
supabase functions deploy inbox-ingest
supabase functions deploy inbox-suggest-reply
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

```
OPENAI_API_KEY=your-openai-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Enable Realtime (Optional)

If you want live updates in the UI:

1. Go to Supabase Dashboard → Database → Replication
2. Enable replication for:
   - `inbox_threads`
   - `inbox_messages`
   - `inbox_tasks`

### 5. Integrate Message Ingestion

To ingest messages, call the API endpoint:

```typescript
await fetch("/api/inbox/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-workspace-id": workspaceId,
  },
  body: JSON.stringify({
    lead_id: leadId,
    content: messageContent,
    channel: "email", // or "sms", "webform", "voicemail"
    sender_email: senderEmail,
    sender_name: senderName,
    subject: subject,
  }),
});
```

Integration points:
- Email webhooks (Gmail, Resend, etc.)
- SMS webhooks (Twilio, etc.)
- Web form submissions
- Voicemail transcriptions

## 🎯 Features Implemented

### ✅ Unified Inbox
- All channels (email, SMS, webform, voicemail) in one place
- Threaded by lead (not campaign)
- Clean, organized view

### ✅ AI Intent Classifier
- 13 roofing-specific intent categories
- Automatic classification on message ingest
- Urgency detection

### ✅ AI Suggested Replies
- Context-aware reply generation
- Intent-specific responses
- Professional, actionable tone

### ✅ Auto-Create Tasks
- Tasks automatically created from messages
- Examples:
  - "Schedule appointment" for booking requests
  - "Resend proposal" for proposal requests
  - "🚨 EMERGENCY" for leaks/emergencies
  - "Prepare contract" for ready-to-proceed

### ✅ Thread Summaries
- AI-generated summaries of conversation history
- Shown at top of thread view
- Helps contractors understand context quickly

### ✅ Urgency Detection
- Marks urgent threads (leaks, emergencies, complaints)
- Urgent threads appear at top with red border
- Separate "Urgent" filter

### ✅ Response Time Dashboard
- Average response time tracking
- Unread message counts
- Urgent thread counts
- Intent breakdown statistics

## 🔗 Integration Points

### Email Webhooks
When emails come in (Gmail, Resend, etc.), call:

```typescript
POST /api/inbox/ingest
{
  lead_id: "...",
  content: "Message content...",
  channel: "email",
  sender_email: "...",
  subject: "..."
}
```

### SMS Webhooks
When SMS messages come in (Twilio, etc.):

```typescript
POST /api/inbox/ingest
{
  lead_id: "...",
  content: "SMS message...",
  channel: "sms",
  sender_email: phoneNumber,
}
```

### Web Forms
When homeowners submit web forms:

```typescript
POST /api/inbox/ingest
{
  lead_id: "...", // or create lead first
  content: "Form message...",
  channel: "webform",
}
```

## 📊 Database Schema Overview

```
inbox_threads (1 per lead)
├── id
├── workspace_id
├── lead_id
├── last_message (preview)
├── summary (AI-generated)
├── last_intent
├── urgency (normal | urgent)
├── unread_count
└── updated_at

inbox_messages (all messages)
├── id
├── workspace_id
├── thread_id
├── lead_id
├── direction (inbound | outbound)
├── content
├── channel (email | sms | webform | voicemail)
├── intent (AI classification)
├── ai_summary
└── created_at

inbox_tasks (auto-generated)
├── id
├── workspace_id
├── thread_id
├── lead_id
├── message_id
├── description
├── due_at
├── task_type
└── completed
```

## 🎨 UI Features

- **Inbox List**: Clean, filterable list of all threads
- **Thread View**: Full conversation with AI summary and suggested replies
- **Dashboard Stats**: At-a-glance metrics (unread, urgent, response time)
- **Filters**: Filter by intent, urgency, unread status
- **Search**: Search messages and summaries
- **Auto-Tasks**: See auto-generated tasks in thread view
- **Quick Actions**: Create tasks, schedule appointments directly from thread

## 🔮 Future Enhancements (v2)

- Auto-send replies based on intent (with approval)
- Calendar integration for appointment creation
- Proposal/invoice auto-generation from messages
- Job creation from "ready to proceed" messages
- Team assignment and collaboration
- Advanced thread summarization with multiple messages
- Multi-language support
- Voice-to-text for phone calls

## 📝 Notes

- **Workspace-based**: All data is scoped to workspaces via RLS
- **Lead-centric**: Threads are organized by lead, not campaign
- **AI-powered**: Intent classification and reply suggestions use GPT-4o-mini
- **Auto-tasks**: Tasks are automatically created for actionable intents
- **Real-time ready**: Schema supports realtime subscriptions (enable in Supabase Dashboard)

## 🎉 Result

SmartSend now has a full-time office assistant that:
- ✅ Organizes all homeowner messages in one place
- ✅ Classifies intent automatically
- ✅ Suggests professional replies
- ✅ Creates tasks from messages
- ✅ Detects urgent situations
- ✅ Tracks response times
- ✅ Provides thread summaries

**This is the feature that makes SmartSend feel alive.**
































