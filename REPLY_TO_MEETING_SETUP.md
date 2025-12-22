# Reply → Meeting End-to-End Setup

This implementation provides a complete flow from detecting reply intents to sending meeting invitations with calendar attachments.

## 🎯 Features

- **Replies Inbox**: View reply intents with meeting detection
- **One-Click Meeting**: Navigate from reply to meeting composer
- **ICS Generation**: Automatic calendar invite creation
- **SMTP Integration**: Send emails with calendar attachments
- **Intent-Based Actions**: Show meeting actions only for relevant replies

## 📁 Files Created/Modified

### New Files
- `lib/mail/simple-send.ts` - SMTP email sending with ICS support
- `app/api/replies/list/route.ts` - List reply intents for workspace
- `app/api/replies/send-meeting/route.ts` - Send meeting reply with ICS
- `app/replies/page.tsx` - Replies inbox UI
- `app/meetings/compose/[email]/page.tsx` - Meeting composer page
- `src/components/ui/label.tsx` - Label UI component

### Environment Updates
- Added `SMTP_SECURE=false` to `.env.local`

## 🚀 Setup Instructions

### 1. Environment Variables

Your `.env.local` already has the required SMTP configuration:

```bash
# SMTP Configuration
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey_or_username
SMTP_PASS=secret
SMTP_FROM_EMAIL=no-reply@yoursite.com
SMTP_FROM_NAME=SmartSend
```

**To use with Gmail:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Generate app password in Gmail settings
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_FROM_NAME=Your Name
```

### 2. Database Setup

Ensure you have the `reply_intents` table with this structure:

```sql
CREATE TABLE IF NOT EXISTS reply_intents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  email TEXT NOT NULL,
  intent TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);
```

### 3. Seed Test Data

Insert a test meeting reply:

```sql
INSERT INTO reply_intents (workspace_id, email, intent, metadata) VALUES
('your-workspace-uuid-here', 'alex@acme.com', 'meeting', '{"confidence": 0.95}');
```

## 🧪 Testing the Flow

### 1. Start Development Server
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

### 2. Access Replies Inbox
Visit: `http://localhost:3000/replies`

- Enter your workspace UUID
- See the meeting reply with "Reply → Meeting" button

### 3. Compose Meeting
- Click "Reply → Meeting" → navigates to `/meetings/compose/alex%40acme.com`
- Set meeting date/time
- Customize subject/body
- Test "Download .ics" button
- Send meeting reply

### 4. Test API Directly

```bash
curl -X POST http://localhost:3000/api/replies/send-meeting \
  -H "Content-Type: application/json" \
  -d '{
    "to": "alex@acme.com",
    "subject": "Quick 15-min intro?",
    "body": "Hey Alex,\nGrab a time here: https://calendly.com/your-handle/15min\nI attached a calendar invite too.\n\n— Julian",
    "startISO": "2025-01-15T18:00:00.000Z",
    "endISO": "2025-01-15T18:15:00.000Z",
    "organizerName": "Julian from SmartSend",
    "organizerEmail": "hello@yourdomain.com",
    "calendlyUrl": "https://calendly.com/your-handle/15min"
  }'
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "messageId": "...",
    "accepted": ["alex@acme.com"],
    "rejected": []
  }
}
```

## 🔧 Key Components

### Reply Intent Detection
- Uses existing intent detection system
- Filters for `intent === "meeting"`
- Shows actionable buttons only for relevant replies

### Meeting Composer
- Pre-fills recipient email from URL parameter
- Date/time picker with UTC support
- ICS file generation and download
- One-click send with calendar attachment

### SMTP Integration
- Uses nodemailer for email delivery
- Supports ICS calendar attachments
- Configurable SMTP providers (Gmail, Brevo, etc.)

## 🎨 UI Features

### Replies Inbox
- Clean table layout with intent badges
- Color-coded intent indicators (green=positive, red=negative)
- Workspace ID input for filtering
- Real-time loading states

### Meeting Composer
- Intuitive form with date/time pickers
- Pre-filled templates for common scenarios
- ICS download for testing
- Success/error feedback

## 🔒 Security & Validation

- Environment variable validation
- Required field checking
- Email format validation
- SMTP error handling
- Secure ICS generation

## 📈 Performance

- Efficient database queries with limits
- Minimal dependencies
- Fast ICS generation
- Optimized email sending

## 🚀 Next Steps

1. **Customize Templates**: Update meeting email templates
2. **Add Calendly Integration**: Connect to Calendly API
3. **Team Features**: Multi-user workspace support
4. **Analytics**: Track meeting conversion rates
5. **Automation**: Auto-send based on intent confidence

## 🐛 Troubleshooting

### SMTP Issues
- Check credentials in `.env.local`
- Verify SMTP provider settings
- Test with Gmail app password

### Database Issues
- Ensure `reply_intents` table exists
- Check workspace UUID format
- Verify Supabase connection

### ICS Issues
- Check date/time format (UTC)
- Verify organizer email is set
- Test ICS file download first

This implementation provides a solid foundation for converting reply intents into booked meetings, directly boosting your MB/100 metric by reducing time between intent detection and meeting booking.