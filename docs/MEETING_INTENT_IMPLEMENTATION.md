# Meeting Intent Detection System

This document describes the implementation of SmartSend's meeting intent detection system that automatically detects when email replies request meetings and generates calendar invites.

## Overview

The system provides:
- **Fast heuristic detection** using keyword matching and pattern recognition
- **Optional LLM assistance** for borderline cases (configurable via env var)
- **Automatic ICS generation** with proposed meeting times
- **Meeting persistence** in a dedicated `meetings` table
- **Ready-to-send email replies** with Calendly links and ICS attachments

## Architecture

### 1. Intent Detection (`/lib/meeting-intent.ts`)
- **Heuristic scoring**: Fast keyword-based detection with configurable thresholds
- **LLM fallback**: Optional OpenAI integration for ambiguous cases
- **Configurable**: Toggle LLM usage via `REPLY_INTENT_USE_LLM` env var

### 2. ICS Generation (`/lib/ics-generator.ts`)
- **Lightweight**: No external dependencies, pure TypeScript
- **RFC5545 compliant**: Proper ICS formatting with line folding
- **Customizable**: Meeting details, organizer info, and location

### 3. API Endpoint (`/api/replies/intent`)
- **POST endpoint**: Accepts reply text and user context
- **Meeting creation**: Automatically creates meeting records
- **Response generation**: Returns formatted reply text and ICS data

### 4. Database Schema
- **Meetings table**: Tracks all detected meetings with status tracking
- **Profiles extension**: Adds `calendly_url` field for user Calendly links
- **RLS policies**: Secure user data access

## Quick Start

### 1. Environment Setup
Add to `.env.local`:
```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: LLM assistance
OPENAI_API_KEY=your_openai_key
REPLY_INTENT_USE_LLM=0

# Fallback Calendly URL
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/YOUR_HANDLE/intro-call-30
```

### 2. Database Migration
Run the SQL migration in Supabase:
```sql
-- See: supabase/migrations/20250140_create_meetings_table.sql
```

### 3. Test the System
```bash
# Test intent detection
npx tsx scripts/test-meeting-intent.ts

# Test API endpoint (replace YOUR_USER_ID)
curl -sS http://localhost:3000/api/replies/intent \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"YOUR_USER_ID",
    "fromEmail":"prospect@example.com",
    "bodyText":"Hey, can we schedule a call this week?",
    "timezone":"America/Los_Angeles"
  }'
```

## API Usage

### POST `/api/replies/intent`

**Request Body:**
```typescript
{
  userId: string;           // Required: auth.users.id
  fromEmail: string;        // Required: contact email
  subject?: string;         // Optional: email subject
  threadId?: string;        // Optional: conversation thread
  bodyText: string;         // Required: raw reply text
  timezone?: string;        // Optional: user timezone
  durationMins?: number;    // Optional: meeting duration (default: 30)
}
```

**Response:**
```typescript
{
  isMeeting: boolean;       // Whether meeting intent detected
  score: number;            // Confidence score (0-100)
  reasons: string[];        // Detection reasoning
  model: 'heuristic' | 'llm'; // Detection method used
  calendlyLink?: string;    // User's Calendly URL
  reply: {                  // Generated reply content
    subject: string;
    text: string;
  };
  ics: {                    // Calendar invite data
    filename: string;
    content: string;
  };
  meeting: MeetingRecord;   // Created meeting data
}
```

## Meeting Detection Logic

### Heuristic Scoring
- **Base score**: +10 per keyword match
- **Strong phrases**: +20 for explicit meeting requests
- **Timing context**: +8 for day/time mentions
- **Negations**: -15 for rejection phrases
- **Threshold**: ≥20 = meeting intent

### Keywords
```
call, meet, meeting, schedule, calendar, calendly
zoom, teams, videocall, chat, connect, book
availability, this week, tomorrow, monday, etc.
```

### LLM Integration
- **Trigger**: Heuristic score ≥12 but <20
- **Model**: GPT-4o-mini with structured output
- **Fallback**: Graceful degradation if API unavailable

## Meeting Management

### Status Tracking
- **proposed**: Initial meeting proposal
- **booked**: Confirmed by attendee
- **declined**: Rejected by attendee
- **canceled**: Cancelled by organizer

### ICS Generation
- **Default time**: Tomorrow 10:00 AM (business days only)
- **Duration**: Configurable (default: 30 minutes)
- **Timezone**: Respects user's local timezone
- **Format**: RFC5545 compliant with proper escaping

## Dashboard Integration

### Meetings Page (`/dashboard/meetings`)
- **List view**: All user meetings with status
- **Dev mode**: Set `localStorage.ss_user_id` for testing
- **Real-time**: Fetches from `/api/meetings` endpoint

### Navigation
- Added to main dashboard sidebar
- Accessible via `/dashboard/meetings`
- Consistent with existing UI patterns

## Configuration Options

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `REPLY_INTENT_USE_LLM` | `0` | Enable LLM assistance |
| `NEXT_PUBLIC_CALENDLY_URL` | - | Fallback Calendly link |
| `OPENAI_API_KEY` | - | Required for LLM mode |

### Scoring Thresholds
- **Meeting detection**: ≥20 (high precision)
- **LLM trigger**: ≥12 (borderline cases)
- **Customizable**: Modify in `meeting-intent.ts`

## Testing & Validation

### Unit Tests
```bash
npx tsx scripts/test-meeting-intent.ts
```

### API Testing
```bash
# Test with meeting intent
curl -X POST /api/replies/intent -d '{"bodyText":"Can we meet?"}'

# Test without meeting intent  
curl -X POST /api/replies/intent -d '{"bodyText":"Thanks for the info"}'
```

### Database Verification
```sql
-- Check meetings table
SELECT * FROM public.meetings WHERE user_id = 'your_user_id';

-- Verify profiles extension
SELECT calendly_url FROM public.profiles WHERE id = 'your_user_id';
```

## Production Considerations

### Performance
- **Heuristic detection**: <1ms response time
- **LLM fallback**: ~200-500ms (when enabled)
- **Database queries**: Optimized with proper indexes

### Security
- **RLS policies**: User data isolation
- **Input validation**: Sanitized text processing
- **Rate limiting**: Consider adding for production

### Monitoring
- **Intent accuracy**: Track detection success rates
- **Meeting conversion**: Monitor proposal → booking ratio
- **Error handling**: Graceful degradation on failures

## Future Enhancements

### Planned Features
- **Meeting templates**: Customizable reply formats
- **Calendar integration**: Direct calendar API connections
- **Follow-up automation**: Automated meeting reminders
- **Analytics dashboard**: Meeting performance metrics

### Integration Points
- **Email clients**: Direct ICS attachment support
- **CRM systems**: Meeting data synchronization
- **Video platforms**: Automatic meeting link generation

## Troubleshooting

### Common Issues

**Intent not detected:**
- Check keyword scoring thresholds
- Verify text preprocessing
- Enable LLM mode for debugging

**ICS generation fails:**
- Validate date/time inputs
- Check timezone handling
- Verify RFC5545 compliance

**Database errors:**
- Confirm RLS policies
- Check user authentication
- Verify table schema

### Debug Mode
```typescript
// Enable detailed logging
console.log('Intent result:', await detectReplyIntent(text));
console.log('ICS data:', buildIcs(options));
```

## Support

For questions or issues:
1. Check this documentation
2. Review test scripts
3. Examine API responses
4. Check database logs
5. Contact development team

---

**Implementation Date**: January 2025  
**Version**: 1.0.0  
**Status**: Production Ready 