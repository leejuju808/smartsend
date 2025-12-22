# Gmail → SmartSend Bridge Implementation (MVP)

## Overview

This implementation enables automatic reply detection when someone replies to your cold emails. When a reply comes in via Gmail, it automatically hits the Edge Function and marks the lead as replied.

## Architecture

1. **Subject Token Tagging**: All outgoing emails get a token `[SS|leadId]` appended to the subject
2. **Gmail Filter**: Filters replies containing the token into a label
3. **Google Apps Script**: Processes labeled replies and sends to Edge Function
4. **Edge Function**: Receives webhook, classifies reply with AI, and updates database

## Implementation Details

### A) Subject Token Tagging

The token `[SS|leadId]` is automatically appended to email subjects when emails are sent. This happens in the following locations:

1. **`supabase/functions/send-queue/index.ts`** - Main send queue worker
   - Fetches `lead_id` from `send_queue` table
   - Appends token: `${originalSubject} [SS|${leadId}]`

2. **`src/app/api/send-queue/route.ts`** - Alternative send worker
   - Appends token: `${originalSubject} [SS|${job.lead_id}]`

3. **`supabase/functions/send-dispatcher/index.ts`** - Dispatcher worker
   - Appends token: `${row.subject} [SS|${row.lead_id}]`

**Subject Format:**
```
${originalSubject} [SS|${leadId}]
```

**Example:**
```
Quick question re: AI inbox [SS|ld_2ab3c]
```

### B) Gmail Setup (Manual - One Time)

1. **Create Label:**
   - Gmail → Create label → "SmartSend Replies"

2. **Create Filter:**
   - Search: `subject:[SS|`
   - Click "Create filter"
   - Apply the label "SmartSend Replies"
   - Check "Also apply to matching conversations"

### C) Google Apps Script

See `google-apps-script-smartsend-reply-bridge.js` for the complete script.

**Setup Steps:**

1. Go to [script.new](https://script.new) (Google Apps Script)
2. Paste the code from `google-apps-script-smartsend-reply-bridge.js`
3. Update configuration:
   ```javascript
   const EDGE_FUNCTION_URL = 'https://YOUR-SUPABASE-PROJECT.functions.supabase.co/reply-detection';
   const EDGE_FUNCTION_BEARER = 'Bearer YOUR_SERVER_SIDE_KEY_OR_FUNC_KEY';
   const WEBHOOK_SECRET = 'YOUR_MATCHING_SECRET'; // Optional, if using secret
   ```
4. **Project Settings → Scopes:**
   - Accept Gmail + URL fetch scopes when prompted

5. **Triggers → Add trigger:**
   - Function: `processReplies`
   - Event source: Time-driven
   - Type: Every minute (or every 5 minutes)

### D) Edge Function (`supabase/functions/reply-detection/index.ts`)

**Features:**
- Handles CORS preflight requests
- Optional secret validation via `x-ss-secret` header (set `REPLY_WEBHOOK_SECRET` env var)
- AI-powered reply classification using GPT-4o-mini
- Updates `campaign_leads.has_replied = true` and `campaign_leads.replied = true`
- Updates `leads.status = 'replied'` for consistency

**Environment Variables:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` - OpenAI API key for classification
- `REPLY_WEBHOOK_SECRET` (optional) - Shared secret for additional security

**Request Payload:**
```json
{
  "leadId": "ld_2ab3c",
  "emailSnippet": "Thanks for reaching out! I'm interested..."
}
```

**Response:**
```json
{
  "success": true,
  "isReply": true,
  "leadId": "ld_2ab3c"
}
```

### E) Database Updates

When a reply is detected, the following are updated:

1. **`campaign_leads` table:**
   - `has_replied = true`
   - `replied = true` (if column exists)
   - `replied_at = <timestamp>`

2. **`leads` table:**
   - `status = 'replied'`
   - `replied_at = <timestamp>`

## Testing Flow

1. **Send test email:**
   - Send yourself a test email from SmartSend
   - Subject should contain `[SS|ld_test123]`

2. **Reply from another account:**
   - Reply with any text
   - Confirm the reply thread gets labeled "SmartSend Replies"

3. **Wait for trigger:**
   - Wait for Apps Script trigger (or run `processReplies()` manually)
   - Check Apps Script logs for processing confirmation

4. **Verify in database:**
   - Check `campaign_leads.has_replied = true` for the lead
   - Check `leads.status = 'replied'`

5. **Verify in UI:**
   - Realtime hook should flip "Replied" badge (from Slice 2)
   - Check `/inbox` UI for updated status

## Security

### Optional Secret Validation

To add an extra layer of security, set `REPLY_WEBHOOK_SECRET` in your Edge Function environment variables and match it in the Apps Script:

**Edge Function:**
```typescript
const REPLY_WEBHOOK_SECRET = Deno.env.get("REPLY_WEBHOOK_SECRET");
```

**Apps Script:**
```javascript
const WEBHOOK_SECRET = 'YOUR_MATCHING_SECRET';
headers['x-ss-secret'] = WEBHOOK_SECRET;
```

## Files Modified

1. `supabase/functions/send-queue/index.ts` - Added token to subjects
2. `supabase/functions/reply-detection/index.ts` - Updated to handle webhook, secret validation, database updates
3. `src/app/api/send-queue/route.ts` - Added token to subjects
4. `supabase/functions/send-dispatcher/index.ts` - Added token to subjects
5. `src/app/api/campaigns/queue/route.ts` - Added comment about token addition

## Files Created

1. `google-apps-script-smartsend-reply-bridge.js` - Complete Apps Script code
2. `GMAIL_BRIDGE_IMPLEMENTATION.md` - This documentation

## Next Steps

1. Deploy the updated Edge Functions to Supabase
2. Set up Gmail label and filter (one-time manual step)
3. Copy Apps Script code and configure with your Supabase URL and keys
4. Set up trigger to run every minute
5. Test the flow end-to-end

## Troubleshooting

- **Token not in subject:** Check that emails are going through the updated send paths
- **Replies not being detected:** Verify Gmail filter is working, check Apps Script logs
- **Edge Function errors:** Check Supabase function logs, verify environment variables
- **Database not updating:** Verify `campaign_leads` table has `has_replied` column

