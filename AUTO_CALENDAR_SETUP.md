# Auto-Calendar Insert Feature Setup

## Overview
The Auto-Calendar Insert feature automatically detects meeting intent in email replies and generates Calendly links with .ics calendar attachments. This drives the North Star metric: **MB/100 (Meetings Booked per 100 Replies)**.

## 📋 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install `ical-generator@^7.2.0` which was added to `package.json`.

### 2. Run Database Migrations

Apply the SQL migration in your Supabase dashboard or CLI:

```bash
# Option A: Via Supabase SQL Editor
# Copy and paste the contents of supabase-auto-calendar-migration.sql

# Option B: Via Supabase CLI (if available)
supabase db push
```

Or manually run this SQL in your Supabase SQL Editor:

```sql
-- Add calendly_url column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendly_url TEXT;

-- Create meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  message_id uuid,
  calendly_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meetings_profile_id ON meetings(profile_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON meetings(created_at);
```

### 3. Configure User Calendly URL

Update a user's profile with their Calendly URL:

```sql
UPDATE profiles 
SET calendly_url = 'https://calendly.com/your-username/meeting' 
WHERE email = 'user@example.com';
```

### 4. Start Development Server

```bash
npm run dev
```

## 🧪 Testing

### Manual Test with cURL

```bash
# Test with meeting intent
curl -X POST http://localhost:3000/api/reply-intent \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg_123",
    "senderEmail": "user@example.com",
    "subject": "Let'\''s talk",
    "body": "Can we schedule a quick call?",
    "leadEmail": "lead@example.com",
    "leadFirstName": "John"
  }'
```

Expected response:
```json
{
  "intent": "meeting",
  "calendlyLink": "https://calendly.com/your-username/meeting",
  "message": "Meeting intent detected. Invite sent."
}
```

### Automated Test Script

```bash
chmod +x scripts/test-reply-intent.sh
./scripts/test-reply-intent.sh
```

## 🎯 Feature Details

### How It Works

1. **Intent Detection**: Uses regex pattern to detect meeting-related keywords:
   - schedule, meet, call, chat, connect

2. **Profile Lookup**: Fetches the sender's profile and Calendly URL from Supabase

3. **Idempotency Check**: Prevents duplicate emails by checking `message_id`

4. **Calendar Generation**: Creates a .ics file with:
   - Meeting scheduled 2 days from now
   - 30-minute duration
   - Auto-populated organizer info

5. **Email Sending**: Sends beautiful HTML email with:
   - Personalized greeting
   - Calendly booking link
   - Attached .ics calendar file

6. **Database Logging**: Records the meeting in `meetings` table with:
   - Meeting status: "pending"
   - Invite status: "sent" or "failed"
   - Lead email tracking

7. **Response**: Returns confirmation with Calendly link

### Database Schema

**profiles table** (updated):
- `calendly_url` TEXT - User's Calendly booking link

**meetings table** (new):
- `id` uuid - Primary key
- `profile_id` uuid - References profiles(id)
- `message_id` uuid - Original email message ID (UNIQUE for idempotency)
- `calendly_url` TEXT - Calendly link used
- `status` TEXT - Meeting status: 'pending', 'confirmed', or 'cancelled'
- `lead_email` TEXT - Lead's email address
- `invite_status` TEXT - Email delivery status: 'sent' or 'failed'
- `invite_sent_at` TIMESTAMP - When the invite email was sent
- `invite_message_id` TEXT - Email provider message ID
- `created_at` TIMESTAMP - When the meeting was logged

## ✅ Acceptance Criteria

- ✅ Detects reply intent via regex (meeting-related words)
- ✅ Prevents duplicate sends via idempotency check
- ✅ Sends beautiful HTML email with Calendly link
- ✅ Attaches .ics calendar file to email
- ✅ Logs meeting with invite status in Supabase
- ✅ MB/100 metric can now increase automatically

## 🔧 Environment Variables

Add these to your `.env.local`:

```env
# SMTP Configuration (for sending invite emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="SmartSend AI <your-email@gmail.com>"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🚀 Next Steps

1. **Integration**: Connect this endpoint to your email reply webhook
2. **Enhancement**: Replace regex with OpenAI for better intent detection
3. **Automation**: Auto-send emails with calendar invites when intent is detected
4. **Analytics**: Track MB/100 metric in dashboard

## 📁 Files Created/Modified

- `src/app/api/reply-intent/route.ts` - Main API endpoint with email sending
- `src/lib/email/sendInvite.ts` - Email sending utility with .ics attachment
- `src/lib/email/templates/MeetingInvite.tsx` - Beautiful HTML email template
- `supabase/migrations/20251016_auto_calendar_insert.sql` - Database migration
- `supabase-auto-calendar-migration.sql` - Standalone migration file
- `scripts/test-reply-intent.sh` - Test script with all scenarios
- `package.json` - Added ical-generator dependency
