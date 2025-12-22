# SmartSend Auto-Reply Engine

A drop-in auto-reply system that detects meeting intent in inbound emails and automatically responds with Calendly links and ICS calendar attachments.

## 🚀 Features

- **Smart Intent Detection**: Automatically detects when someone wants to schedule a meeting/call
- **Instant Auto-Replies**: Sends immediate responses with Calendly booking links
- **ICS Attachments**: Includes calendar invites for one-click scheduling
- **Provider Agnostic**: Works with SendGrid, Postmark, Mailgun, or any webhook
- **Draft Fallback**: Saves drafts if email sending isn't configured
- **Workspace Scoped**: Multi-tenant ready with proper isolation

## 📋 Prerequisites

- SmartSend workspace with Supabase backend
- Email provider API key (Resend, SendGrid, or Postmark)
- Calendly account for scheduling

## 🛠️ Installation

### 1. Database Migration

Run the migration in your Supabase SQL editor:

```sql
-- The migration file: supabase/migrations/20250103_create_auto_reply_system.sql
-- This creates the auto_replies table and related functionality
```

### 2. Environment Variables

Add these to your `.env.local`:

```env
# Required for scoping data to a workspace
NEXT_PUBLIC_DEMO_WORKSPACE_ID=YOUR_WORKSPACE_UUID

# Auto-reply settings
AUTOREPLY_ENABLED=true
CALENDLY_URL=https://calendly.com/YOUR_HANDLE/intro
REPLY_FROM_NAME=SmartSend Team
REPLY_FROM_EMAIL=you@yourdomain.com
REPLY_MEETING_DURATION_MIN=30
REPLY_TIMEZONE=America/Los_Angeles
REPLY_TEMPLATE_GREETING=Thanks for reaching out!

# Email provider (choose ONE)
RESEND_API_KEY=your_resend_key
# OR
SENDGRID_API_KEY=your_sendgrid_key
# OR
POSTMARK_SERVER_TOKEN=your_postmark_token

# Webhook security
INBOUND_WEBHOOK_SECRET=superlongrandomstring
```

### 3. Restart Development Server

```bash
npm run dev
```

## 🔧 Configuration

### Meeting Intent Detection

The system automatically detects meeting intent using keywords like:
- `call`, `meeting`, `zoom`, `schedule`, `book a time`
- `tomorrow`, `next week`, `available time`
- `demo`, `discussion`, `walk through`

### Reply Templates

Customize the auto-reply content:

```env
REPLY_TEMPLATE_GREETING=Thanks for reaching out!
REPLY_MEETING_DURATION_MIN=30
REPLY_TIMEZONE=America/Los_Angeles
```

### Email Provider Setup

Choose one email provider:

#### Resend
```env
RESEND_API_KEY=re_123...
```

#### SendGrid
```env
SENDGRID_API_KEY=SG.123...
```

#### Postmark
```env
POSTMARK_SERVER_TOKEN=123...
```

## 🌐 Webhook Setup

### Webhook URL
```
POST https://yourdomain.com/api/inbound/email?workspaceId=YOUR_UUID&secret=YOUR_SECRET
```

### Provider-Specific Setup

#### SendGrid Inbound Parse
1. Go to Settings → Inbound Parse
2. Set webhook URL to your endpoint
3. Choose "POST" method
4. The system automatically parses multipart form data

#### Postmark
1. Go to Sending → Inbound
2. Set webhook URL
3. The system parses JSON payload

#### Mailgun
1. Go to Routes → Create Route
2. Set forward action to your webhook URL
3. Include secret via header: `X-Webhook-Secret: YOUR_SECRET`

## 📱 Usage

### 1. Monitor Inbox

Visit `/dashboard/inbox` to see:
- Inbound messages
- Auto-reply status
- Configuration details
- Webhook endpoint info

### 2. Test the System

Use the test script:

```bash
npx tsx scripts/test-auto-reply.ts
```

### 3. Manual Send

If auto-reply is disabled or fails, manually send drafts:

```bash
curl -X POST /api/replies/send-draft \
  -H "Content-Type: application/json" \
  -d '{"id": "draft-uuid", "toEmail": "recipient@example.com"}'
```

## 🔍 How It Works

### 1. Inbound Processing
- Webhook receives email from provider
- Parses email content (JSON or form-data)
- Stores in `inbound_messages` table

### 2. Intent Detection
- Analyzes subject and body text
- Uses keyword matching for meeting intent
- Calculates confidence score

### 3. Auto-Reply Generation
- Creates reply draft with Calendly link
- Generates ICS calendar attachment
- Saves to `auto_replies` table

### 4. Email Delivery
- If enabled and provider configured: sends immediately
- If disabled or no provider: saves as draft
- Updates status (sent/draft/error/skipped)

## 📊 Database Schema

### `auto_replies` Table
```sql
- id: UUID primary key
- workspace_id: UUID (workspace scope)
- inbound_id: UUID (references inbound_messages)
- status: draft|sent|error|skipped
- reason: why skipped/error
- subject, html, text: reply content
- ics_filename, ics_content: calendar attachment
- sent_at: when email was sent
- created_at: when reply was created
```

### Views
- `auto_reply_summary`: Easy querying of reply status

## 🧪 Testing

### Local Testing
1. Set environment variables
2. Run test script: `npx tsx scripts/test-auto-reply.ts`
3. Check inbox page: `/dashboard/inbox`
4. Verify database entries

### Webhook Testing
Use ngrok for local development:

```bash
ngrok http 3000
# Use https://abc123.ngrok.io/api/inbound/email?... as webhook URL
```

## 🚨 Troubleshooting

### Common Issues

#### "No email provider configured"
- Set one of: `RESEND_API_KEY`, `SENDGRID_API_KEY`, or `POSTMARK_SERVER_TOKEN`

#### "Unauthorized" webhook errors
- Check `INBOUND_WEBHOOK_SECRET` matches webhook URL
- Verify `workspaceId` parameter

#### ICS files not working
- Check timezone setting (`REPLY_TIMEZONE`)
- Verify meeting duration (`REPLY_MEETING_DURATION_MIN`)

#### Auto-replies not sending
- Ensure `AUTOREPLY_ENABLED=true`
- Check email provider API key is valid
- Review inbox page for error reasons

### Debug Mode

Check the inbox page for:
- Configuration status
- Provider availability
- Webhook endpoint details

## 🔮 Future Enhancements

- **Real Availability**: Extract actual calendar slots
- **Multiple ICS Options**: Suggest 3 different times
- **Provider Verification**: DKIM, signature checks
- **Workspace Routing**: Auto-detect by recipient domain
- **Template Editor**: Customize reply content per workspace
- **Analytics**: Track reply success rates and meeting bookings

## 📞 Support

For issues or questions:
1. Check the inbox page for configuration status
2. Review database entries for error details
3. Test with the provided test script
4. Check environment variable configuration

## 🎯 Impact

This auto-reply engine transforms inbound interest into scheduled calls:
- **Zero Manual Effort**: Automatic meeting scheduling
- **Professional Response**: Instant, branded replies
- **Calendar Integration**: One-click meeting booking
- **Lead Conversion**: Faster sales cycle closure

Every "let's chat" email now gets an immediate Calendly link + calendar invite! 🚀 