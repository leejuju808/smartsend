# Email Reply Tracking System

This implementation provides a comprehensive email reply tracking system that integrates with Gmail and Outlook to automatically detect and track email replies.

## Components

### 1. Database Migrations

#### `supabase/migrations/20251025_add_reply_fields.sql`
- Adds `thread_id`, `message_id`, `replied_at` fields to `email_logs` table
- Adds `lead_id` field for linking to leads
- Creates indexes for efficient querying
- Adds computed `has_replied` column to `leads` table

#### `supabase/migrations/20251025_rls_email_logs.sql`
- Enables Row Level Security (RLS) on `email_logs` table
- Creates policies for workspace-based access control
- Restricts writes to service role only

### 2. Edge Function

#### `supabase/functions/reply-webhook/index.ts`
- Accepts webhook payloads from email providers
- Filters out auto-replies and out-of-office messages
- Updates email_logs table with reply status
- Supports HMAC verification for security

### 3. Next.js API Route

#### `src/app/api/replies/ingest/route.ts`
- Proxy endpoint for external webhook calls
- Forwards requests to Supabase Edge Function
- Keeps service role credentials secure

## Setup Instructions

### 1. Run Database Migrations

```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
supabase functions deploy reply-webhook
```

### 3. Set Environment Variables

In Supabase Dashboard → Settings → Edge Functions, set:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your service role key
- `WEBHOOK_SECRET`: Secret for HMAC verification (optional)

### 4. Enable Realtime

In Supabase Dashboard → Database → Replication, enable realtime for `email_logs` table.

## Webhook Payload Format

```typescript
{
  workspace_id: string;           // Your tenant/workspace ID
  thread_id: string;              // Provider thread/conversation ID
  message_id?: string;            // Provider message ID
  subject?: string;
  from?: string;
  to?: string;
  snippet?: string;
  text?: string;                  // Plain text body (recommended)
  html?: string;                  // HTML body (fallback)
  provider: "gmail" | "outlook";  // Email provider
  received_at?: string;           // ISO timestamp
  headers?: Record<string, string>;
  hmac?: string;                  // HMAC signature for verification
}
```

## Integration with Email Providers

### Gmail Integration
1. Set up Gmail API with Pub/Sub notifications
2. Watch for new messages in the mailbox
3. Extract thread ID, plain text, and headers
4. POST to `/api/replies/ingest` with the payload

### Outlook Integration
1. Subscribe to Microsoft Graph notifications
2. Fetch message details using Graph API
3. Extract conversation ID and message content
4. POST to `/api/replies/ingest` with the payload

## Auto-Reply Detection

The system automatically filters out:
- Messages with auto-reply headers (`x-autoreply`, `auto-submitted`, etc.)
- Subject lines containing "out of office", "automatic reply", etc.
- Body text with common auto-reply phrases

## Real-time Updates

The dashboard will automatically update when replies are detected thanks to Supabase's realtime functionality. The `email_logs` table changes will trigger real-time updates to connected clients.

## Security

- HMAC verification ensures webhook authenticity
- RLS policies restrict access to workspace data
- Service role credentials are kept server-side
- Only service role can write to email_logs table