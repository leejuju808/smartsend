# SmartSend Core Sending Engine

🚀 **Complete cold email sending engine with personalization, reply tracking, and meeting automation**

## What's Been Implemented

### 1. Database Schema ✅
- **Core tables**: `send_queue`, `email_events`, `unsubscribes`, `campaign_targets`
- **Enhanced existing tables**: Added missing columns to `campaigns` and `mailboxes`
- **SQL functions**: Rate limiting, batch processing, counter management
- **Row-level security**: All tables properly secured

### 2. Core Libraries ✅
- **`lib/mailer.ts`**: SMTP sender with connection pooling, retry logic, and proper headers
- **`lib/ics.ts`**: Calendar invite generator with meeting scheduling
- **`lib/personalize.ts`**: Template personalization with `{{variable}}` replacement
- **`lib/intent.ts`**: Reply intent detection (rules + optional OpenAI)
- **`lib/unsub.ts`**: Unsubscribe token management and suppression

### 3. API Routes ✅
- **`/api/campaigns/create`**: Create new campaigns with targeting
- **`/api/campaigns/queue`**: Queue contacts for sending (with suppression checks)
- **`/api/campaigns/start`**: Start running campaigns
- **`/api/campaigns/pause`**: Pause active campaigns
- **`/api/cron/send`**: Cron job for processing send queue (max 10/min)
- **`/api/unsubscribe/[token]`**: One-click unsubscribe handling
- **`/api/inbound`**: Webhook for receiving email replies
- **`/api/replies/meeting`**: Send meeting replies with ICS attachments

### 4. Campaign UI ✅
- **Campaign page**: Stats, controls, and queue monitoring
- **Real-time updates**: Progress bars, status indicators
- **Action buttons**: Start, pause, queue contacts
- **Queue viewer**: See all emails in send queue

## Quick Start Guide

### 1. Environment Setup
Copy `env.template` to `.env.local` and configure:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SMTP_HOST=smtp.brevo.com
SMTP_USER=your_username
SMTP_PASS=your_password
SMTP_FROM_EMAIL=your@email.com

# Optional but recommended
CRON_SECRET=random_secret_here
INBOUND_WEBHOOK_SECRET=webhook_secret_here
OPENAI_API_KEY=your_openai_key
```

### 2. Database Migration
Run the SQL migration in Supabase:

```sql
-- Run this in your Supabase SQL editor
-- File: supabase/migrations/20250132_create_core_sending_engine.sql
```

### 3. Vercel Cron Setup
In your Vercel project settings:

1. Go to **Settings** → **Cron Jobs**
2. Add new cron job:
   - **URL**: `POST https://yourdomain.com/api/cron/send`
   - **Schedule**: `* * * * *` (every minute)
   - **Headers**: `Authorization: Bearer YOUR_CRON_SECRET`

### 4. Test the System

#### Create a Campaign
```bash
curl -X POST /api/campaigns/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "subject": "Hi {{first_name}}, interested in {{company}}?",
    "body_html": "<p>Hi {{first_name}},</p><p>I noticed {{company}} and thought...</p>",
    "daily_limit": 50
  }'
```

#### Queue Contacts
```bash
curl -X POST /api/campaigns/queue \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "campaign-uuid",
    "custom_emails": [
      {
        "email": "test@example.com",
        "name": "John Doe",
        "company": "Acme Corp",
        "custom_fields": {"industry": "tech"}
      }
    ]
  }'
```

#### Start Campaign
```bash
curl -X POST /api/campaigns/start \
  -H "Content-Type: application/json" \
  -d '{"campaign_id": "campaign-uuid"}'
```

## How It Works

### 1. Email Sending Flow
```
Campaign Created → Contacts Queued → Campaign Started → Cron Processes Queue → Emails Sent
```

### 2. Rate Limiting
- **Per mailbox**: Daily/hourly limits configurable
- **Per campaign**: Daily limits with delay options
- **Cron safety**: Max 10 emails per minute

### 3. Personalization
- **Template variables**: `{{first_name}}`, `{{company}}`, `{{custom_field}}`
- **Dynamic content**: Personalized subject and body
- **Fallback handling**: Graceful degradation for missing data

### 4. Reply Tracking
- **Inbound webhook**: Receives replies from your email provider
- **Intent detection**: Identifies meeting requests, interest, etc.
- **Automatic actions**: Triggers workflows based on reply content

### 5. Unsubscribe Management
- **One-click**: Secure token-based unsubscribe
- **Suppression list**: Prevents future sends to unsubscribed emails
- **Compliance**: Proper List-Unsubscribe headers

## Advanced Features

### Meeting Automation
When a reply contains meeting intent:
1. **Detect intent** using rules or AI
2. **Log event** in `ai_reply_events`
3. **Send meeting reply** with ICS calendar invite
4. **Track conversion** in campaign metrics

### Reply Intent Detection
**Rule-based patterns**:
- Meeting: "can we schedule", "available time", "calendar"
- Interest: "pricing", "demo", "more info"
- Rejection: "not interested", "pass"

**AI-powered** (optional):
- OpenAI integration for enhanced classification
- Falls back to rules if AI fails

### Email Provider Support
Works with any SMTP provider:
- **Brevo/Sendinblue**: `smtp.brevo.com:587`
- **Mailersend**: `smtp.mailersend.net:587`
- **Mailgun**: `smtp.mailgun.org:587`
- **Amazon SES**: `email-smtp.us-east-1.amazonaws.com:587`

## Monitoring & Analytics

### Campaign Metrics
- **Send progress**: Real-time status updates
- **Reply rates**: Track engagement and conversions
- **Error tracking**: Failed sends with detailed error messages
- **Queue monitoring**: See pending emails and scheduling

### Email Events
All email interactions are logged:
- **Sent**: Successfully delivered
- **Opened**: Email opened (if tracking enabled)
- **Clicked**: Links clicked (if tracking enabled)
- **Replied**: Reply received and processed
- **Bounced**: Delivery failures

## Security Features

### Authentication
- **User isolation**: Campaigns are user-scoped
- **API protection**: All routes require authentication
- **Cron security**: Optional secret verification

### Data Protection
- **Row-level security**: Database-level access control
- **Input validation**: All API inputs sanitized
- **Rate limiting**: Prevents abuse and spam

### Compliance
- **Unsubscribe headers**: RFC-compliant List-Unsubscribe
- **Suppression management**: Respects unsubscribe requests
- **Audit trails**: Complete logging of all actions

## Troubleshooting

### Common Issues

**Emails not sending**:
1. Check mailbox verification status
2. Verify SMTP credentials
3. Check daily/hourly limits
4. Review cron job configuration

**Cron not working**:
1. Verify Vercel cron job is active
2. Check `CRON_SECRET` environment variable
3. Review function logs in Vercel dashboard

**Replies not being received**:
1. Configure inbound webhook in your email provider
2. Verify webhook endpoint is accessible
3. Check webhook signature verification

### Debug Mode
Enable detailed logging by setting:
```bash
DEBUG=smartsend:*
```

## Next Steps

### Immediate Upgrades
1. **Bounce handling**: Process bounce webhooks
2. **Open/click tracking**: Add pixel and link tracking
3. **A/B testing**: Subject line and content testing
4. **Sequence automation**: Multi-step follow-up campaigns

### Advanced Features
1. **Team collaboration**: Multi-user campaign management
2. **Advanced analytics**: Conversion funnels, ROI tracking
3. **Integration APIs**: CRM, calendar, and automation tools
4. **AI optimization**: Content optimization and send time optimization

## Support

- **Documentation**: This README + inline code comments
- **Code structure**: Follows Next.js App Router patterns
- **Database**: Supabase with proper migrations
- **Deployment**: Vercel-ready with cron support

---

🚀 **Ready to send cold emails at scale!** 

The SmartSend Core Sending Engine provides everything you need to:
- ✅ Send personalized cold emails safely
- ✅ Track replies and detect intent
- ✅ Automate meeting scheduling
- ✅ Manage unsubscribes and compliance
- ✅ Scale with proper rate limiting

**Ship it and start converting!** 🔥 