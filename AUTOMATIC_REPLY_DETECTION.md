# Automatic Reply Detection Feature

## Overview

This feature automatically detects replies to campaign emails and marks leads as "Replied" in the dashboard. The system uses AI to classify reply types (interested, scheduling, not interested, etc.) and updates lead status automatically — no manual tracking needed.

## What Was Implemented

### 1. Database Schema Updates

**File:** `supabase/migrations/20251026191632_add_reply_detection.sql`

Added new columns to the `leads` table:
- `reply_detected` (BOOLEAN) - Flag indicating if a reply was detected
- `reply_summary` (TEXT) - AI-generated summary of the reply
- `reply_classification` (TEXT) - AI classification (interested, scheduling, not_interested, unsubscribe, ooo, etc.)

Added fields to the `campaign_logs` table:
- `event_type` - Type of event (e.g., 'reply_detected', 'classification')
- `details` (JSONB) - Full classification details including confidence scores
- `classification` - Reply type classification

### 2. API Endpoint for Reply Detection

**File:** `src/app/api/replies/detect/route.ts`

A new API endpoint that:
- Accepts incoming reply data (fromEmail, toEmail, subject, snippet, bodyText)
- Finds the contact and campaign associated with the reply
- Uses AI to classify the reply using the existing `classifyReplyText` function
- Updates the leads table with reply detection status
- Updates campaign_recipients status to 'replied'
- Logs the classification in campaign_logs
- Automatically stops future campaign sends for certain reply types

**API Usage:**
```typescript
POST /api/replies/detect
{
  "fromEmail": "customer@example.com",
  "toEmail": "sender@example.com",
  "subject": "Re: Your proposal",
  "snippet": "I'm interested in learning more...",
  "bodyText": "Full email text..."
}
```

### 3. Enhanced Reply Processing

**File:** `src/lib/replies.ts`

Updated the `ReplyProcessor` class to automatically update leads when a reply is detected:

- When a reply comes in through the inbound webhook, it now:
  1. Processes the reply as before
  2. **NEW:** Finds the associated lead by contact email
  3. **NEW:** Updates the lead with:
     - `reply_detected = true`
     - `reply_summary` with AI-generated summary
     - `reply_classification` with the intent type
     - `status = 'replied'`
     - `replied_at = current timestamp`

### 4. Dashboard UI Updates

**File:** `src/app/campaigns/[id]/LeadsTable.tsx`

Enhanced the LeadsTable component to display reply information:

**Changes:**
- Added new fields to the Lead type: `reply_detected`, `reply_summary`, `reply_classification`
- Updated the query to fetch these new fields from the database
- Enhanced the status display to show:
  - Green badge with the classification type (e.g., "interested", "scheduling")
  - Reply summary text below the badge
  - Automatic highlighting when `reply_detected = true`

**Visual Example:**
```
Replied Badge: 🟢 "interested"
Summary: "The lead expressed interest in scheduling a demo call"
```

## How It Works

### Flow Diagram

```
1. Email arrives at webhook (/api/inbound)
   ↓
2. ReplyProcessor.processReply() called
   ↓
3. AI classifies the reply (classifyReplyText)
   ↓
4. Find associated lead by email
   ↓
5. Update lead with:
   - reply_detected = true
   - reply_summary = AI summary
   - reply_classification = AI classification
   - status = 'replied'
   - replied_at = now()
   ↓
6. Dashboard automatically shows green "Replied" badge
```

### AI Classification Types

The system classifies replies into these categories:

- **interested** - Lead shows interest in your product/service
- **scheduling** - Lead wants to book a meeting or call
- **not_interested** - Lead declines the offer
- **unsubscribe** - Lead requests to be removed
- **ooo** (Out of Office) - Automatic OOO response
- **neutral** - Standard reply, no clear intent
- **spam** - Spam or suspicious content

## Configuration

### Environment Variables Required

```bash
OPENAI_API_KEY=your_openai_api_key  # For AI classification
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Auto-Stop Behavior

For certain reply types, the system automatically stops future campaign sends:
- `interested` - Stop to allow personal follow-up
- `scheduling` - Stop as meeting is scheduled
- `not_interested` - Stop to respect lead's choice
- `unsubscribe` - Stop as per request

## Testing

To test the feature:

1. **Via Webhook:**
   ```bash
   curl -X POST http://localhost:3000/api/inbound \
     -H "Content-Type: application/json" \
     -d '{
       "from": "test@example.com",
       "to": "sender@example.com",
       "subject": "Re: Your email",
       "body-plain": "I am interested in learning more."
     }'
   ```

2. **Check Dashboard:**
   - Go to Campaign → Leads table
   - Look for green "interested" or "scheduling" badge
   - Verify reply summary appears below the badge

## Benefits

✅ **Automatic:** No manual tracking required  
✅ **AI-Powered:** Intelligent classification of reply types  
✅ **Real-time:** Updates happen instantly via webhook  
✅ **Visual:** Clear badges and summaries in dashboard  
✅ **Smart:** Auto-stops future sends based on reply type  

## Future Enhancements

Possible improvements:
- [ ] Add reply sentiment analysis
- [ ] Track reply quality scores
- [ ] Create automated follow-up campaigns based on reply type
- [ ] Add reply templates for common reply types
- [ ] Notification system for important replies
- [ ] Reply analytics and insights

## Files Modified

1. `supabase/migrations/20251026191632_add_reply_detection.sql` - Database schema
2. `src/app/api/replies/detect/route.ts` - New API endpoint
3. `src/lib/replies.ts` - Enhanced reply processing
4. `src/app/campaigns/[id]/LeadsTable.tsx` - UI updates

## Related Files

- `src/lib/ai/classifyReply.ts` - AI classification logic (already existed)
- `src/app/api/inbound/route.ts` - Inbound webhook handler (already existed)

---

**Feature Status:** ✅ Complete and Ready for Use
