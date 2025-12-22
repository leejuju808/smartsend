# Block 150000 — Unified Messaging Inbox Implementation

## Overview
This block implements a unified messaging inbox system that gathers all communication channels (Email, SMS, Widget, Calls) into ONE THREAD per homeowner. This becomes the single source of truth for all homeowner communication.

## What Was Implemented

### 1. Database Schema ✅
- **Unified `messages` table** (`supabase/migrations/20250130000001_block150000_unified_messaging_inbox.sql`)
  - Stores all messages from all channels
  - Fields: `company_id`, `lead_id`, `channel`, `direction`, `sender`, `body`, `metadata`, `read_by_users`
  - Includes indexes for performance
  - RLS policies for security
  - Helper function `mark_messages_read()` for read state tracking
  - View `messages_inbox_view` for inbox list queries

### 2. Channel Hooks ✅
All channels now insert into the unified `messages` table:

- **Email Replies** (`src/app/api/inbound/reply/route.ts`)
  - Hooks into email reply processing
  - Extracts lead info and inserts unified message

- **SMS Inbound** (`app/api/inbox/sms/inbound/route.ts`)
  - Hooks into Twilio webhook handler
  - Creates unified message for incoming SMS

- **SMS Outbound** (`app/api/inbox/sms/send/route.ts`)
  - Hooks into SMS sending
  - Creates unified message for outgoing SMS

- **Widget Chat** (`app/api/widget/message/route.ts`)
  - Hooks into widget message handler
  - Creates unified messages for both visitor and bot messages
  - Updates lead_id after lead creation

- **Call Transcripts** (`app/api/calls/ingest/route.ts`)
  - Hooks into call transcript ingestion
  - Creates unified message with call transcript snippet

### 3. Unified Inbox UI ✅
- **Inbox List** (`app/inbox/unified/page.tsx`)
  - Shows all leads with latest message
  - Displays channel icons (📧 Email, 💬 SMS, 💭 Widget, 📞 Call)
  - Shows heat score, unread count, time
  - Filters: All, Unread, Hot Leads

- **Thread View** (`app/inbox/unified/[leadId]/page.tsx`)
  - Timeline of all messages across all channels
  - Shows channel, sender, timestamp for each message
  - Auto-detects best reply channel (SMS vs Email)
  - Smart templates for quick replies
  - Reply box with channel selection

### 4. API Routes ✅
- **GET `/api/inbox/unified`** - Get inbox list
- **GET `/api/inbox/unified/[leadId]`** - Get thread messages
- **POST `/api/inbox/unified/[leadId]`** - Mark messages as read
- **GET `/api/roofing-companies`** - Get user's companies

### 5. Features ✅
- ✅ Auto-channel selection (detects last used channel)
- ✅ Smart templates (Request Address, Booking Confirmation, Estimate Follow-Up, Insurance Claim Script, Leak Emergency Script)
- ✅ Read state tracking (read_by_users array)
- ✅ Unread count badges
- ✅ Channel icons and colors
- ✅ Heat score display

## Helper Functions

### `lib/unified-messages.ts`
- `insertUnifiedMessage()` - Insert message into unified table
- `getCompanyIdFromLead()` - Get company_id from lead_id
- `getCompanyIdFromWorkspace()` - Get company_id from workspace_id

## Database Functions

### `mark_messages_read(p_lead_id, p_user_id)`
Marks all messages for a lead as read by a user. Updates the `read_by_users` array.

## Views

### `messages_inbox_view`
View that shows the latest message per lead with:
- Lead information (name, email, phone, address, heat_score)
- Unread count
- Latest message preview
- Channel and timestamp

## Next Steps (Future Enhancements)

1. **Notifications**
   - Push notifications for new messages
   - Badge counts in navigation
   - Email notifications for owners

2. **Advanced Features**
   - Message search
   - Filter by channel
   - Bulk actions
   - Message forwarding
   - Attachments support

3. **Analytics**
   - Response time tracking
   - Channel performance metrics
   - Lead engagement scoring

## Testing

To test the unified inbox:

1. **Run the migration:**
   ```bash
   # The migration file is at:
   # supabase/migrations/20250130000001_block150000_unified_messaging_inbox.sql
   ```

2. **Access the inbox:**
   - Navigate to `/inbox/unified`
   - You should see all leads with their latest messages

3. **View a thread:**
   - Click on any lead
   - Navigate to `/inbox/unified/[leadId]`
   - See all messages across all channels

4. **Test channels:**
   - Send an email reply → should appear in unified inbox
   - Send/receive SMS → should appear in unified inbox
   - Use widget chat → should appear in unified inbox
   - Ingest call transcript → should appear in unified inbox

## Notes

- All channel handlers gracefully handle unified message insertion failures
- The system is backward compatible with existing inbox systems
- Read state is tracked per user in the `read_by_users` array
- The inbox view automatically groups messages by lead_id


























