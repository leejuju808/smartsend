# AI Reply Detection (MVP-Ready) - Setup Guide

## ✅ Implementation Complete

This guide covers the MVP-ready AI Reply Detection feature that automatically detects if an incoming Gmail message is a real human reply and marks it in your Supabase DB.

## 🧩 Components

### 1. Supabase Edge Function: `reply-detection`

**Location:** `supabase/functions/reply-detection/index.ts`

**What it does:**
- Accepts `leadId` and `emailSnippet` from incoming email
- Uses OpenAI GPT-4o-mini to classify if it's a genuine human reply
- Updates `campaign_leads.has_replied = true` when detected
- Returns `{ success: true, isReply: boolean, leadId: string }`

**Deployment:**

```bash
# Deploy the edge function
supabase functions deploy reply-detection --no-verify-jwt

# Set environment variables in Supabase Dashboard:
# - OPENAI_API_KEY
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
```

**Local testing:**

```bash
# Test locally with supabase CLI
supabase functions serve reply-detection --env-file ./supabase/.env

# Invoke with test data
supabase functions invoke reply-detection --data '{"leadId": "test1", "emailSnippet": "Hey, thanks for reaching out"}'
```

### 2. Next.js API Route

**Location:** `src/app/api/reply-detection/route.ts`

**Endpoint:** `POST /api/reply-detection`

**Body:**
```json
{
  "leadId": "uuid-of-lead",
  "emailSnippet": "Thanks for reaching out! I would love to learn more."
}
```

**Response:**
```json
{
  "success": true,
  "isReply": true,
  "leadId": "uuid-of-lead"
}
```

### 3. Inbox UI Hook

**Location:** `src/hooks/useReplyDetectionRealtime.ts`

**Usage:**
```typescript
import { useReplyDetectionRealtime } from '@/hooks/useReplyDetectionRealtime'

// In your Inbox component:
useReplyDetectionRealtime(({ leadId, isReply }) => {
  if (isReply) {
    console.log(`Reply detected for lead ${leadId}`)
    // Refresh your inbox data
    loadInbox()
  }
})
```

**What it does:**
- Listens to `campaign_leads` table changes via Supabase Realtime
- Triggers callback when `has_replied` changes from `false` to `true`
- Provides `leadId`, `campaignLeadId`, and `isReply` in the callback

### 4. Testing Stub

**Location:** `src/lib/reply-detection/test-stub.ts`

**Usage:**
```typescript
import { simulateReplyDetection, SAMPLE_TEST_CASES } from '@/lib/reply-detection/test-stub'

// Test a genuine reply
await simulateReplyDetection({
  leadId: 'test-lead-123',
  emailSnippet: 'Hey, thanks for reaching out! I would love to learn more.'
})

// Or use sample test cases
for (const testCase of SAMPLE_TEST_CASES) {
  await simulateReplyDetection(testCase)
}
```

## 🔄 Integration with Gmail Webhook

To use this with your Gmail webhook, call the API route from your webhook handler:

```typescript
// In your Gmail webhook handler (e.g., src/app/api/gmail/webhook/route.ts)
import { extractEmailSnippet } from '@/lib/email/parsers'

export async function POST(req: NextRequest) {
  // ... parse incoming Gmail message ...
  
  // Extract email snippet (first 500 chars)
  const emailSnippet = extractEmailSnippet(messageBody)
  
  // Find leadId from sender email
  const leadId = await findLeadIdFromEmail(senderEmail)
  
  if (leadId && emailSnippet) {
    // Call AI reply detection
    await fetch('/api/reply-detection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, emailSnippet }),
    })
  }
  
  // ... rest of webhook handling ...
}
```

## 📊 Database Schema

The feature uses the existing `campaign_leads` table:

```sql
-- Already exists via migration: 20251101073110_add_has_replied_to_campaign_leads.sql
ALTER TABLE campaign_leads
  ADD COLUMN IF NOT EXISTS has_replied boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_has_replied 
  ON campaign_leads(has_replied) WHERE has_replied = true;
```

## 🧪 Testing Checklist

- [ ] Deploy edge function: `supabase functions deploy reply-detection --no-verify-jwt`
- [ ] Set environment variables in Supabase Dashboard
- [ ] Test with sample payload: `supabase functions invoke reply-detection --data '{"leadId": "test1", "emailSnippet": "Thanks for reaching out"}'`
- [ ] Verify `campaign_leads.has_replied` is updated in database
- [ ] Test realtime hook in Inbox UI - verify UI refreshes when reply detected
- [ ] Test with various email types (genuine reply, auto-reply, bounce)
- [ ] Integrate with Gmail webhook handler

## 🚀 Next Steps

1. **Connect to Gmail webhook** - Add the API call to your existing Gmail webhook handler
2. **Add UI notifications** - Show toast notification when reply is detected
3. **Add error handling** - Handle edge cases (no lead found, API failures, etc.)
4. **Add analytics** - Track detection accuracy and response times

## 📝 Notes

- The OpenAI model used is `gpt-4o-mini` for cost efficiency
- The function uses a simple prompt - you can enhance it with more context if needed
- The realtime hook only triggers on `has_replied` changing from `false` to `true` to avoid duplicate refreshes
- Make sure Supabase Realtime is enabled for the `campaign_leads` table in your Supabase project settings

