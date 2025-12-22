# Reply Intent Detection with AI - Implementation Complete ✅

## 🎯 Overview

AI-powered reply intent detection that automatically:
- Detects reply intent using OpenAI GPT-4o-mini (interested, not interested, neutral)
- Inserts Calendly link + ICS calendar attachment for interested replies
- Updates message + meeting records in Supabase

## 📦 Files Created/Modified

### 1. API Route: `/src/app/api/reply-intent/route.ts`

**Features:**
- ✅ OpenAI GPT-4o-mini integration for intent classification
- ✅ Uses existing `generateIcs()` utility from `/src/lib/ics.ts`
- ✅ Supabase integration for data persistence
- ✅ Comprehensive error handling and validation
- ✅ Automatic meeting scheduling (2 days out, 30-min duration)

**Improvements:**
- Simple, clean implementation using GPT-4o-mini
- Proper input validation
- Returns meeting time in ISO format for convenience
- Uses environment variables for Calendly URL and organizer email
- Better error messages and logging

### 2. Database Migration: `/supabase/migrations/20251018_add_meetings_table.sql`

**Features:**
- ✅ Creates meetings table with proper schema
- ✅ Adds indexes for performance (message_id, sender_email, status)
- ✅ Sets up RLS policies for security
- ✅ Includes updated_at trigger
- ✅ Safe to run on existing databases (uses `IF NOT EXISTS`)

**Schema:**
```sql
- id: uuid (primary key)
- message_id: uuid
- sender_email: text (required)
- intent: text (interested | not interested | neutral)
- calendly_link: text
- ics_file: text
- status: text (default: pending)
- created_at: timestamptz
- updated_at: timestamptz
```

### 3. Test Script: `/test-reply-intent-ai.sh`

**Test Cases:**
1. Interested reply - expects calendar + Calendly link
2. Not interested reply - expects simple intent classification
3. Neutral reply - expects simple intent classification
4. Validation test - missing required fields

## 🚀 Setup & Usage

### 1. Environment Variables

Add to your `.env.local`:

```bash
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/yourname/meeting
ORGANIZER_EMAIL=hello@smartsend.ai
```

### 2. Apply Database Migration

```bash
# Apply the migration
supabase db push

# Or if using migrations folder
supabase migration up
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Test the API

```bash
# Run all tests
./test-reply-intent-ai.sh

# Or test manually
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "550e8400-e29b-41d4-a716-446655440000",
    "replyText": "Sure, lets hop on a quick call",
    "senderEmail": "prospect@example.com"
  }'
```

## 📊 API Reference

### Endpoint: `POST /api/reply-intent`

**Request Body:**
```typescript
{
  messageId: string;      // UUID of the original message
  replyText: string;      // The reply text to analyze
  senderEmail: string;    // Email of the person replying
}
```

**Response (Interested):**
```json
{
  "success": true,
  "intent": "interested",
  "calendlyLink": "https://calendly.com/yourname/meeting",
  "meetingTime": "2025-10-20T10:00:00.000Z",
  "message": "Interested reply detected — calendar inserted automatically.",
  "meeting": {
    "id": "...",
    "message_id": "...",
    "sender_email": "prospect@example.com",
    "intent": "interested",
    "calendly_link": "...",
    "ics_file": "BEGIN:VCALENDAR...",
    "status": "pending",
    "created_at": "..."
  }
}
```

**Response (Not Interested / Neutral):**
```json
{
  "success": true,
  "intent": "not interested" // or "neutral"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Missing required fields: messageId, replyText, senderEmail"
}
```

## 🔍 How It Works

1. **Intent Detection**: 
   - Uses OpenAI GPT-4o-mini to classify reply intent
   - System prompt: "Classify as: interested, not interested, neutral"
   - Temperature: 0.3 (for consistency)
   - Max tokens: 10 (only need one word)

2. **Auto-Calendar Logic**:
   - If intent = "interested":
     - Generates ICS file (2 days from now, 30 min duration)
     - Creates meeting record in Supabase
     - Returns Calendly link + ICS content
   - Otherwise:
     - Updates message with intent classification
     - Returns simple intent result

3. **Database Storage**:
   - All meetings stored in `public.meetings` table
   - Includes full ICS file content for later retrieval
   - Tracks status: pending → confirmed → completed

## 🧪 Testing Examples

### Test 1: Interested Reply
```bash
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "uuid-here",
    "replyText": "Sure, lets hop on a quick call!",
    "senderEmail": "prospect@example.com"
  }'
```

Expected: `intent: "interested"` + Calendly link + ICS file

### Test 2: Not Interested Reply
```bash
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "uuid-here",
    "replyText": "Thanks but not interested right now",
    "senderEmail": "prospect@example.com"
  }'
```

Expected: `intent: "not interested"`

### Test 3: Neutral Reply
```bash
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "uuid-here",
    "replyText": "Thanks for reaching out",
    "senderEmail": "prospect@example.com"
  }'
```

Expected: `intent: "neutral"`

## 🔒 Security

- RLS policies ensure users can only view their own meetings
- Service role required for insertions
- Input validation on all required fields
- Error messages don't leak sensitive information

## 📈 Next Steps

Potential enhancements:
1. Add email sending with ICS attachment for interested replies
2. Integrate with calendar APIs (Google Calendar, Outlook)
3. Add meeting confirmation workflow
4. Track meeting outcomes (completed, cancelled, no-show)
5. Add analytics dashboard for reply intent trends
6. Support multiple languages for intent detection
7. Add confidence scores to intent classification

## 🐛 Troubleshooting

**Issue: "Missing required fields" error**
- Ensure all three fields are provided: messageId, replyText, senderEmail

**Issue: Meeting not created in database**
- Check Supabase connection and service role key
- Verify migration was applied successfully
- Check RLS policies

**Issue: OpenAI API errors**
- Verify OPENAI_API_KEY is set correctly
- Check API quota/billing
- Ensure gpt-4o-mini model is available

**Issue: ICS file not generated**
- Check imports: `generateIcs` from `@/lib/ics`
- Verify function exists and exports are correct

## ✅ Verification Checklist

- [x] API route created and updated
- [x] Database migration created
- [x] Test script created
- [x] Documentation complete
- [ ] Migration applied to database
- [ ] Environment variables configured
- [ ] API tested with real OpenAI key
- [ ] Integration with existing message flow

---

**Implementation Date**: October 18, 2025  
**Status**: ✅ Complete and ready for testing
