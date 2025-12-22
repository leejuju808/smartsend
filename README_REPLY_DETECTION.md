# SmartSend: AI Reply Detection + Auto-Mark as Replied

This slice implements automated reply detection using AI, with automatic marking of emails as replied when a genuine human response is detected.

## Components

### Canonical Message-ID Mapping
- **Migration:** `supabase/migrations/20251112131500_message_id_linkage.sql`
  - Adds `send_message_ids` mapping table and `reply_link_resolver` view
  - Extends `reply_events` with `in_reply_to`, `references_arr`, `thread_key`, and `parent_queue_id`
  - Exposes helper RPC `link_reply_to_parent(uuid)` for resolving replies
- **Edge Function:** `supabase/functions/reply-intake/index.ts`
  - Parses inbound headers, persists linkage metadata, and calls the resolver RPC
- **Send Orchestrator:** `supabase/functions/sender-worker/index.ts`
  - Stamps canonical `Message-ID` headers (`<q_{QUEUE_UUID}@m.smartsend.ai>`) and upserts mapping rows before provider send

### 1. Database Migration
**File:** `supabase/migrations/20250229000000_emails_reply_detection.sql`

Extends the `emails` table with:
- `message_id` - Provider Message-ID when email was sent
- `thread_id` - Provider thread/conversation ID
- `has_replied` - Boolean flag for reply status
- `last_reply_at` - Timestamp of most recent reply
- `lead_name` - Lead name for display
- `user_id` - User/owner reference

**Important:** When sending campaign emails, store the `message_id` and `thread_id` in the `emails` table to enable perfect matching.

### 2. Edge Function: `detectReply`
**File:** `supabase/functions/detectReply/index.ts`

This Edge Function:
- Receives normalized inbound email payloads
- Matches replies to original emails via `in_reply_to` (Message-ID) or `thread_id`
- Uses OpenAI GPT-4o-mini to detect if it's a real human reply (vs auto-reply/OOO/bounce)
- Updates `emails.has_replied = true` and `emails.last_reply_at` when a real reply is detected
- Also updates linked leads with `replied = true`

**Environment Variables Required:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `SUPABASE_FUNCTION_SECRET` - Secret to protect the function (set in `.env.local`)
- `OPENAI_API_KEY` - OpenAI API key for AI detection (optional, falls back to heuristics)

### 3. Next.js API Route: `/api/inbound/email`
**File:** `src/app/api/inbound/email/route.ts`

This route:
- Accepts provider-specific payloads (Gmail, Outlook, Mailgun, etc.)
- Normalizes them into a consistent shape
- Forwards to the Edge Function for processing
- Supports both JSON and form-urlencoded payloads

**Environment Variables:**
- `INBOUND_WEBHOOK_SECRET` (optional) - For webhook signature verification
- `SUPABASE_FUNCTION_SECRET` - Must match Edge Function secret

### 4. Server-Side Replies Page
**File:** `src/app/dashboard/replies/page-server.tsx`

Server component that queries the `emails` table and displays replies inbox.
You can replace the existing client-side `page.tsx` with this if you prefer server-side rendering.

**Component:** `src/app/dashboard/replies/_components/ReplyRow.tsx`
Displays individual reply row with lead name, subject, reply status, and time ago.

### 5. Test Script
**File:** `scripts/test-reply.sh`

Development script to test the webhook. Usage:

```bash
./scripts/test-reply.sh
```

Or with custom host:
```bash
HOST=http://localhost:3000 ./scripts/test-reply.sh
```

## Setup

1. **Run the migration:**
   ```bash
   # Apply the migration via Supabase CLI or dashboard
   supabase migration up
   ```

2. **Deploy the Edge Function:**
   ```bash
   supabase functions deploy detectReply
   ```

3. **Set environment variables in `.env.local`:**
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_FUNCTION_SECRET=supersecretstring  # Use a strong secret!
   OPENAI_API_KEY=your_openai_key  # Optional but recommended
   ```

4. **Configure your email provider webhooks:**
   - Point webhook URLs to: `https://yourdomain.com/api/inbound/email`
   - For Gmail: Use Gmail API push notifications or polling
   - For Outlook: Use Microsoft Graph webhooks
   - For Mailgun/SendGrid: Configure inbound webhooks in their dashboards

## How It Works

1. **Inbound Email Arrives** → Provider webhook sends payload to `/api/inbound/email`
2. **Normalization** → Next.js route normalizes provider-specific format
3. **Edge Function** → Processes normalized payload:
   - Finds matching original email via `in_reply_to` or `thread_id`
   - Runs AI detection to determine if it's a real reply
   - Updates `emails` table: `has_replied = true`, `last_reply_at = now()`
   - Updates linked `leads.replied = true`
4. **Replies Page** → Displays all emails with `has_replied = true`, ordered by `last_reply_at`

## Provider-Agnostic Design

The system normalizes different provider formats:

**Gmail:**
```json
{
  "message_id": "<msg-id>",
  "headers": { "In-Reply-To": "<original-id>" },
  "threadId": "thread123"
}
```

**Mailgun:**
```
form-data with message-headers JSON
```

**Outlook:**
```json
{
  "provider_message_id": "...",
  "inReplyTo": "...",
  "conversationId": "..."
}
```

All normalized to:
```json
{
  "provider": "gmail|outlook|mailgun",
  "message_id": "...",
  "in_reply_to": "...",
  "thread_id": "...",
  "from": "...",
  "to": ["..."],
  "subject": "...",
  "text": "..."
}
```

## Security

- Edge Function protected by `SUPABASE_FUNCTION_SECRET`
- Only callable from your Next.js server (not exposed to clients)
- RLS policies ensure users only see their own emails
- Optional webhook signature verification via `INBOUND_WEBHOOK_SECRET`

## Notes

- Make sure to store `message_id` and `thread_id` when sending emails
- AI detection requires OpenAI API key (falls back to heuristics if missing)
- Orphan replies (no matching original) are logged but don't error
- System is designed to be provider-agnostic and extensible

