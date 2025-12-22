# Quick Start: Auto Meeting Scheduling

## 🚀 5-Minute Setup

### Step 1: Install Dependencies
```bash
pnpm install
```

All required packages (`nodemailer`, `resend`) are already in `package.json` and will be installed automatically.

### Step 2: Configure Environment Variables

Add these to your `.env.local`:

```bash
# Mail Provider Configuration
MAIL_PROVIDER=smtp  # or 'resend'

# For SMTP (if MAIL_PROVIDER=smtp)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-password

# For Resend (if MAIL_PROVIDER=resend)
RESEND_API_KEY=re_your_api_key_here
```

**Note**: Your Supabase credentials should already be configured.

### Step 3: Apply Database Migration

```bash
cd supabase
supabase db push
```

This creates:
- `calendly_url` and `timezone` columns on `profiles`
- `meetings` table with RLS policies
- `replied_at`, `reply_intent`, `meeting_id` columns on `messages`
- Index for efficient reply lookups

### Step 4: Start Development Server

```bash
pnpm dev
```

### Step 5: Configure Your Meeting Settings

1. Navigate to: `http://localhost:3000/settings/meetings`
2. Enter your Calendly URL (e.g., `https://calendly.com/your-handle/intro`)
3. Set your timezone (e.g., `America/Los_Angeles`)
4. Click **Save**

---

## ✅ Test the System

### Option 1: Test with curl

```bash
curl -X POST http://localhost:3000/api/replies/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "YOUR_PROFILE_ID",
    "from_email": "test@example.com",
    "to_email": "you@yourdomain.com",
    "body_text": "Yes, let'\''s schedule a call this week!"
  }'
```

**Expected Response**:
```json
{
  "ok": true,
  "intent": "positive",
  "meeting_id": "uuid-here"
}
```

### Option 2: Check Database

After the test, verify in Supabase:

```sql
-- Check meetings table
SELECT * FROM meetings WHERE attendee_email = 'test@example.com';

-- Check messages table (if message_id was provided)
SELECT replied_at, reply_intent, meeting_id FROM messages WHERE id = 'your-message-id';
```

### Option 3: Check Email Inbox

The prospect (`test@example.com`) should receive:
- Email with subject: "Let's talk — calendar invite attached"
- Attached `meeting.ics` calendar file
- Calendly link (if configured)
- Tentative meeting time

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAIL_PROVIDER` | No | `smtp` | Email provider: `smtp` or `resend` |
| `SMTP_HOST` | Yes (if SMTP) | - | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port (587 or 465) |
| `SMTP_USER` | Yes (if SMTP) | - | SMTP username |
| `SMTP_PASS` | Yes (if SMTP) | - | SMTP password |
| `RESEND_API_KEY` | Yes (if Resend) | - | Resend API key |

### Profile Settings (via UI)

| Setting | Default | Description |
|---------|---------|-------------|
| `calendly_url` | `null` | Your Calendly scheduling link |
| `timezone` | `America/Los_Angeles` | Preferred timezone for scheduling |

---

## 📊 How It Works

### Flow Diagram

```
Prospect Replies
    ↓
Webhook receives reply → /api/replies/webhook
    ↓
Classify Intent (positive/neutral/negative)
    ↓
[If Positive]
    ↓
Create Meeting Record
    ↓
Generate ICS File
    ↓
Send Email with:
  - Calendar Invite
  - Calendly Link
  - Tentative Time
    ↓
Update Message Record
```

### Intent Classification

**Positive**: yes, let's talk, schedule, book, call, meeting, interested, chat, time, available

**Negative**: no, unsubscribe, stop, not interested, remove, busy, later

**Neutral**: Everything else

---

## 🔌 Integration with Inbound Email

To fully automate, connect your email provider's inbound webhook:

### Mailgun
1. Go to **Receiving** → **Routes**
2. Create route for your domain
3. Forward to: `https://yourdomain.com/api/replies/webhook`
4. Map Mailgun payload to expected format (custom adapter needed)

### SendGrid
1. Go to **Settings** → **Inbound Parse**
2. Add host and URL: `https://yourdomain.com/api/replies/webhook`
3. Map SendGrid payload to expected format (custom adapter needed)

### Custom Webhook Payload Format

```typescript
{
  profile_id: string        // Required: User ID from your system
  from_email: string        // Required: Prospect's email
  to_email: string          // Required: Your inbox
  sender_id?: string        // Optional: Sender record ID
  campaign_id?: string      // Optional: Campaign ID
  message_id?: string       // Optional: Original message ID
  body_text?: string        // Optional: Plain text content
}
```

---

## 🎯 What You Get

### For Users
- ✅ Automatic meeting scheduling from positive replies
- ✅ One-click calendar invite acceptance
- ✅ Flexible rescheduling via Calendly
- ✅ Timezone-aware scheduling

### For Analytics
- ✅ Track meetings per campaign
- ✅ Reply-to-meeting conversion rates
- ✅ Intent classification metrics
- ✅ Source attribution (which message → meeting)

---

## 🐛 Troubleshooting

### Emails Not Sending

**Check**:
- `MAIL_PROVIDER` is set correctly
- SMTP credentials are valid (test with direct connection)
- Resend API key is active
- Check server logs for detailed errors

**Test SMTP Connection**:
```bash
telnet smtp.yourprovider.com 587
```

### Meetings Not Created

**Check**:
- Database migration ran successfully
- `profile_id` exists in database
- RLS policies allow access
- Check server logs for errors

### Intent Misclassified

**Solution**:
- Adjust keyword lists in `/src/app/api/replies/webhook/route.ts`
- Consider implementing LLM-based classification
- Add logging to track decisions

### Settings Page Shows Wrong Data

**Check**:
- Profile ID is correct (currently hardcoded as `USER_PROFILE_ID`)
- TODO: Wire up actual session/auth
- Database has `calendly_url` and `timezone` columns

---

## 🚀 Next Steps

### Immediate
1. Wire up real profile ID from session
2. Test with actual email provider
3. Configure production environment variables
4. Set up monitoring for email delivery

### Near-term
1. Create provider-specific webhook adapters
2. Implement LLM-based intent classification
3. Add timezone-smart scheduling
4. Build analytics dashboard

### Future
1. Google Calendar / Outlook integration
2. Meeting outcome tracking
3. Auto-followups before meetings
4. CRM sync (Salesforce, HubSpot)

---

## 📚 Reference Files

- **Implementation Guide**: `AUTO_MEETING_SCHEDULING_IMPLEMENTATION.md`
- **Database Schema**: `supabase/migrations/20251008_auto_meetings.sql`
- **ICS Builder**: `lib/ics.ts`
- **Mailer**: `lib/mailer.ts`
- **Webhook Handler**: `src/app/api/replies/webhook/route.ts`
- **Settings UI**: `src/app/(dashboard)/settings/meetings/page.tsx`
- **Settings API**: `src/app/api/settings/meetings/route.ts`

---

## 💡 Tips

1. **Start with SMTP**: Easier to debug than Resend initially
2. **Test Locally First**: Use curl before connecting real email
3. **Monitor Logs**: Check server output for detailed errors
4. **Validate Emails**: Ensure prospect emails are properly formatted
5. **Set Calendly**: Much better UX than just ICS files

---

**Need Help?** Check the full implementation guide in `AUTO_MEETING_SCHEDULING_IMPLEMENTATION.md`
