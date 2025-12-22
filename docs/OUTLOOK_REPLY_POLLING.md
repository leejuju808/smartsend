# Outlook Reply Polling Implementation

## Overview
This document describes the implementation of Outlook reply polling using Microsoft Graph Delta Sync API.

## Components

### 1. SQL Migration
**File:** `supabase/migrations/20250201_outlook_delta_token.sql`
- Adds `delta_token` column to `email_accounts` table
- Stores the delta sync cursor for incremental queries
- Creates index for efficient queries

### 2. Edge Function
**File:** `supabase/functions/outlook-poller/index.ts`
- Polls Outlook inboxes every 3 minutes
- Uses Microsoft Graph Delta Sync API for incremental changes
- Refreshes access tokens automatically
- Detects replies and maps them to campaign threads

**Key Features:**
- Delta sync support for efficient incremental polling
- Automatic token refresh
- Reply detection via conversationId matching
- Creates `replies` records
- Updates lead status to "Replied"
- Inserts `email_logs` entries to trigger cancel_followups_on_reply

### 3. Configuration
**File:** `supabase/config.toml`
- Schedules `outlook-poller` to run every 3 minutes
- Runs as a cron job

### 4. Follow-up Guard
**File:** `src/lib/campaigns/buildQueue.ts`
- Filters out leads with status = "Replied" when building campaign queues
- Prevents enqueuing follow-ups for leads that have already replied

## Workflow

1. **Polling:** Edge function runs every 3 minutes
2. **Delta Sync:** Uses stored `delta_token` or initializes with full query
3. **Message Processing:**
   - Checks if message is a reply to a tracked conversation
   - Matches `conversationId` to `send_logs.thread_id`
   - Only processes inbound messages (not from account owner)
4. **Reply Handling:**
   - Creates `replies` record
   - Updates `leads.status` to "Replied"
   - Inserts `email_logs` with status="replied"
5. **Trigger Fires:** `cancel_followups_on_reply` cancels pending send_queue items
6. **Next Poll:** Stores `deltaLink` for next incremental sync

## Database Tables

### email_accounts
- `delta_token`: Stores Microsoft Graph delta sync cursor
- Already supports `provider = 'outlook'`

### send_logs
- `thread_id`: Stores Outlook `conversationId` (reuses Gmail column)
- Used to match replies to original sends

### email_logs
- `status = 'replied'`: Triggers cancel_followups_on_reply
- `provider_thread_id`: Stores conversationId
- `lead_id`, `campaign_id`, `workspace_id`: Used by trigger to cancel follow-ups

## Prerequisites

Ensure these environment variables are set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_REDIRECT_URI`

## Testing

To test the implementation:
1. Connect an Outlook account via OAuth
2. Send an email campaign to a lead
3. Reply from that lead's inbox
4. Wait for the next poll cycle (up to 3 minutes)
5. Verify:
   - `replies` table has the reply
   - Lead status is "Replied"
   - Pending send_queue items are canceled

## Future Enhancements

- Add Mail.ReadWrite scope for labeling/moving messages
- Support multiple inbox folders
- Add webhook push notifications as alternative to polling
- Implement conversation threading for better matching
