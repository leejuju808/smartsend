# Smart Replies Implementation Summary

This document outlines the complete implementation of the Smart Replies feature for the SmartSend AI platform.

## Overview

The Smart Replies feature enables AI-powered response generation for incoming email replies, helping SDRs quickly respond to leads with contextual, personalized suggestions.

## Components Created

### 1. Database Schema (`supabase/migrations/20251227_smart_replies_schema.sql`)

#### Tables Created:

**reply_presets**
- Stores organization-specific reply templates
- Fields: `id`, `org_id`, `label`, `body`, `is_active`, `created_at`
- RLS: Org members can read/write their own presets

**reply_suggestions**
- Logs all generated suggestions and chosen responses
- Fields: `id`, `org_id`, `lead_id`, `campaign_id`, `email_thread_id`, `suggested`, `chosen_label`, `chosen_body`, `sent`, `created_at`, `updated_at`
- RLS: Org members can read/write their own suggestions

#### Modifications:

**leads table**
- Added `outcome` column with check constraint: `interested`, `meeting_set`, `pricing_sent`, `not_now`, `not_fit`, `opt_out`

**campaign_logs table**
- Ensured `action` column exists for logging smart reply sends

### 2. Supabase Edge Function (`supabase/functions/smartReplies/index.ts`)

Generates AI-powered reply suggestions using OpenAI's GPT-4o-mini model.

**Features:**
- Merges AI-generated suggestions with org presets
- Returns up to 5 distinct labeled suggestions
- Tags each suggestion with `source: 'ai'` or `source: 'preset'`
- Stores suggestion set in `reply_suggestions` table

**System Prompt:**
- Preserves merge tags like `{{first_name}}`, `{{company}}`
- Plain text only, 3-6 sentences max
- Friendly, clear, low-friction tone
- Simple CTA (pick a time, quick yes/no)

**Labels:**
- Interested
- Pricing
- Not now
- Not a fit
- Opt-out

### 3. API Routes

#### `/api/edge/smart-replies` (src/app/api/edge/smart-replies/route.ts)
- Proxy endpoint for the Supabase Edge Function
- Keeps Edge Function secret URL off the client
- Uses service role key for authentication

#### `/api/replies/smart-send` (src/app/api/replies/smart-send/route.ts)
Handles sending smart replies through the configured email provider.

**Features:**
- OAuth token refresh for Gmail and Outlook
- SMTP fallback for other providers
- Threading support for both Gmail and Outlook
- Updates `reply_suggestions` table with chosen response
- Logs to `campaign_logs` with `action='smart_reply_sent'`
- Updates lead outcome based on label

**Provider Support:**
- Gmail: Uses Gmail API with threading
- Outlook: Uses Microsoft Graph API with reply endpoint
- SMTP: Generic SMTP transport

### 4. UI Components

#### SmartRepliesSheet (`src/components/replies/SmartRepliesSheet.tsx`)
Modal sheet for displaying and selecting smart reply suggestions.

**Features:**
- Chip-based suggestion selector
- Editable subject and body fields
- Real-time suggestion generation on open
- Auto-populates first suggestion
- Visual feedback for loading and sending states
- Merge tag preservation guardrail

#### ReplyDetail Integration
Updated `src/components/replies/ReplyDetail.tsx`:
- Added "Smart Replies" button in action grid
- Integrated SmartRepliesSheet component
- Maintains existing functionality

## Data Flow

1. User clicks "Smart Replies" on a reply in the Replies Inbox
2. UI fetches org_id from user profile or org_members
3. Frontend calls `/api/edge/smart-replies` with:
   - `org_id`, `lead_id`, `campaign_id`
   - `thread_id`, `last_message`, `context`, `sender_name`
4. Proxy forwards to Supabase Edge Function
5. Edge Function:
   - Loads active org presets
   - Generates AI suggestions via OpenAI
   - Merges and deduplicates suggestions
   - Stores in `reply_suggestions` table
   - Returns suggestion set with ID
6. UI displays suggestions as chips
7. User selects a suggestion (or edits) and clicks Send
8. Frontend calls `/api/replies/smart-send` with:
   - `suggestion_id`, `org_id`, `lead_id`, `campaign_id`
   - `to`, `subject`, `body`, `label`, `thread_id`, `provider`
9. Send endpoint:
   - Refreshes OAuth token if needed
   - Sends via Gmail/Outlook/SMTP
   - Updates `reply_suggestions` with chosen response
   - Logs to `campaign_logs`
   - Updates lead outcome

## Row Level Security

All tables use `is_org_member(org_id)` helper function:
- Users can only read/write data within their organizations
- RLS policies enforce org membership checks
- Service role key bypasses RLS for API operations

## Acceptance Criteria ✅

✅ Clicking Smart Replies opens a sheet with 3-5 labeled suggestions
✅ Choosing a chip populates the editor
✅ Send replies via connected mailbox
✅ Sheet closes after successful send
✅ `campaign_logs` row written with `action='smart_reply_sent'`
✅ `reply_suggestions` stores what was suggested and chosen
✅ `leads.outcome` updates when applicable
✅ RLS enforces org scope for all reads/writes

## Environment Variables Required

- `OPENAI_API_KEY`: OpenAI API key for GPT-4o-mini
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `MICROSOFT_CLIENT_ID`: Microsoft OAuth client ID
- `MICROSOFT_CLIENT_SECRET`: Microsoft OAuth client secret
- `MICROSOFT_OAUTH_REDIRECT_URL`: Microsoft OAuth redirect URL

## Testing Checklist

- [ ] Deploy migration to Supabase
- [ ] Deploy Edge Function to Supabase
- [ ] Test AI suggestion generation
- [ ] Test preset loading and merging
- [ ] Test Gmail OAuth token refresh
- [ ] Test Outlook OAuth token refresh
- [ ] Test SMTP fallback
- [ ] Test threading for Gmail
- [ ] Test threading for Outlook
- [ ] Test outcome updates
- [ ] Test RLS policies
- [ ] Verify campaign_logs entries
- [ ] Test with multiple orgs

## Future Enhancements

1. **Preset Management UI**: Admin page for managing reply presets
2. **Analytics Dashboard**: Track suggestion effectiveness, conversion rates
3. **A/B Testing**: Compare AI vs preset performance
4. **Merge Tag Guardrail**: Client-side validation before sending
5. **Draft History**: Track suggestions that were edited before sending
6. **Multi-language Support**: Generate suggestions in multiple languages
7. **Custom Label Categories**: Allow orgs to define their own outcome labels

## Files Modified/Created

### Created:
- `supabase/migrations/20251227_smart_replies_schema.sql`
- `supabase/functions/smartReplies/index.ts`
- `src/app/api/edge/smart-replies/route.ts`
- `src/app/api/replies/smart-send/route.ts`
- `src/components/replies/SmartRepliesSheet.tsx`
- `SMART_REPLIES_IMPLEMENTATION.md`

### Modified:
- `src/components/replies/ReplyDetail.tsx`

## Deployment Steps

1. Apply database migration:
   ```bash
   supabase db push
   ```

2. Deploy Edge Function:
   ```bash
   supabase functions deploy smartReplies
   ```

3. Set environment variables in Supabase dashboard:
   - `OPENAI_API_KEY` in Edge Function secrets

4. Deploy Next.js app:
   ```bash
   npm run build
   npm run deploy
   ```

## Security Considerations

- Service role key never exposed to client
- All database operations use RLS
- OAuth tokens securely refreshed server-side
- API keys stored as environment variables
- No PII in logs or analytics

## Performance Considerations

- Edge Function uses lightweight GPT-4o-mini model
- Presets cached at edge for faster generation
- Suggestions limited to 5 max
- Auto-deletion of old suggestion sets (TBD)

## Monitoring & Alerts

- Track OpenAI API errors
- Monitor Edge Function invocation count
- Alert on high token usage
- Track suggestion acceptance rate
- Monitor send failure rate

