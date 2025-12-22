# Unified Send Logging (Gmail + Outlook) Implementation

## Overview
This implementation adds unified logging for both Gmail and Outlook email sends, ensuring replies map perfectly to the right lead across both providers.

## Changes Made

### 1. Database Schema Updates
**File:** `supabase/migrations/20250125_unified_send_logging.sql`

Added to `campaign_logs` table:
- `provider` (text) - 'gmail' or 'outlook'
- `message_id` (text) - Provider's message ID
- `snippet` (text) - Email content snippet (240 chars)
- `direction` (text) - 'outbound' or 'inbound'

Also created helpful indexes for performance.

### 2. Type Definitions
**File:** `src/lib/email/types.ts`

Created shared types:
- `Provider` - "gmail" | "outlook"
- `SendRequest` - Unified request structure
- `SendResult` - Unified result with messageId and threadId

### 3. Provider Implementations
**Files:** 
- `src/lib/email/providers/gmail.ts`
- `src/lib/email/providers/outlook.ts`

Created provider-specific send functions that call the edge functions and return unified `SendResult`.

### 4. Unified Send Facade
**File:** `src/lib/email/send.ts`

Created `sendEmailAndLog()` function that:
- Routes to appropriate provider (Gmail/Outlook)
- Sends email via provider
- Logs to `campaign_logs` with provider, message_id, thread_id

### 5. Queue Dispatcher Updates
**File:** `supabase/functions/queue-dispatcher/index.ts`

Updated `sendViaProvider()` to:
- Return both messageId and threadId
- Support Gmail and Outlook providers
- Detect provider from user_email_providers table

Updated job processing to:
- Call updated `sendViaProvider()`
- Extract provider info
- Log to `campaign_logs` with all required fields:
  - provider
  - message_id
  - thread_id
  - subject
  - snippet
  - direction (outbound)

### 6. Provider Send Function Updates
**File:** `supabase/functions/provider-send/index.ts`

Updated to return both `id` (messageId) and `threadId` in response:
```typescript
return new Response(JSON.stringify({ 
  ok: true, 
  id: result?.id,
  threadId: result?.threadId 
}), { status: 200 });
```

### 7. Extended v_replies View
**File:** `supabase/migrations/20250125_v_replies_provider.sql`

Extended `v_replies` view to include provider info by joining with `campaign_logs` to show which provider was used for the last outbound message.

## Usage

### For New Sends
Use the unified facade:
```typescript
import { sendEmailAndLog } from "@/lib/email/send"

await sendEmailAndLog({
  provider: "gmail" as Provider,
  fromEmail: sender.email,
  toEmail: lead.email,
  subject: step.subject,
  bodyHtml: compiledHtml,
  bodyText: compiledText,
  leadId: lead.id,
  campaignId: step.campaign_id,
  userId: lead.owner_id,
})
```

### For Replies Detection
The `campaign_logs` table now contains all the information needed to match replies:
- `thread_id` matches Gmail threadId or Outlook conversationId
- `provider` tells you which provider to check
- `message_id` for tracking

### In UI Components
Show provider badge in logs/replies:
```tsx
<span className="text-xs rounded-md border px-2 py-0.5">
  {r.provider ?? "gmail"}
</span>
```

## Next Steps

1. **Deploy SQL Migrations:**
   - Run `supabase/migrations/20250125_unified_send_logging.sql`
   - Run `supabase/migrations/20250125_v_replies_provider.sql`

2. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy queue-dispatcher
   supabase functions deploy provider-send
   ```

3. **Implement Outlook Provider:**
   - The provider-send function currently only handles Gmail
   - Add Outlook/Microsoft Graph support to provider-send
   - Follow Gmail pattern but use Graph API

4. **Update Reply Detection:**
   - Modify detect-reply function to use provider info
   - Query campaign_logs with provider + thread_id
   - Map replies to correct leads regardless of provider

5. **UI Updates (Optional):**
   - Add provider filter to logs view
   - Show provider badge in replies table
   - Add provider stats to dashboard

## Safety Checks (Recommended)

### When Sending:
- Check if lead already has status='Replied', skip new outbound step
- If thread_id is missing, log warning and consider retry/backoff
- Normalize email casing for joins (lower(email))

### In Reply Detection:
- Match by provider + thread_id for accuracy
- Fallback to email if thread_id missing
- Track both inbound and outbound in campaign_logs

## Testing

1. **Test Gmail Sends:**
   - Send email via Gmail
   - Verify campaign_logs has provider='gmail'
   - Verify thread_id and message_id populated

2. **Test Outlook Sends:**
   - Send email via Outlook
   - Verify campaign_logs has provider='outlook'
   - Verify conversationId stored as thread_id

3. **Test Reply Detection:**
   - Send via Gmail
   - Receive reply
   - Verify reply matches by thread_id + provider

4. **Test Provider Switching:**
   - Send to same lead via different providers
   - Verify separate logs for each send
   - Verify replies map to correct thread

## Database Schema

### campaign_logs (Updated)
```sql
campaign_logs (
  id uuid,
  lead_id uuid references leads(id),
  campaign_id uuid references campaigns(id),
  thread_id text,           -- Gmail threadId OR Outlook conversationId
  message_id text,           -- Provider message ID
  provider text,             -- 'gmail' | 'outlook'
  subject text,
  snippet text,              -- Email snippet
  direction text,            -- 'outbound' | 'inbound'
  sent_at timestamptz,
  created_at timestamptz
)
```

## Files Changed
- ✅ `supabase/migrations/20250125_unified_send_logging.sql` (NEW)
- ✅ `supabase/migrations/20250125_v_replies_provider.sql` (NEW)
- ✅ `src/lib/email/types.ts` (NEW)
- ✅ `src/lib/email/providers/gmail.ts` (NEW)
- ✅ `src/lib/email/providers/outlook.ts` (NEW)
- ✅ `src/lib/email/send.ts` (NEW)
- ✅ `supabase/functions/queue-dispatcher/index.ts` (UPDATED)
- ✅ `supabase/functions/provider-send/index.ts` (UPDATED)
