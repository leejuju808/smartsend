# Campaign Queue System Setup Guide

This guide walks you through setting up and testing the campaign/message queue system for SmartSend AI.

## 📋 Overview

The campaign system allows you to:
- Create email campaigns with templated subject/body using Handlebars-style syntax (`{{first_name}}`)
- Queue contacts for sending while respecting suppressions
- Process sends in batches with Send Safety checks (caps, bounce guard)
- Track message status (pending → sending → sent/failed/skipped)

## 🗄️ Database Setup

### 1. Run SQL Schema

Open your Supabase SQL Editor and paste the contents from:
```
/supabase/campaigns-schema.sql
```

This creates:
- `campaigns` table - stores campaign metadata and templates
- `messages` table - message queue with status tracking
- Row Level Security policies
- Indexes for performance

## 🔧 Environment Variables

Add these to your `.env.local` (most should already exist):

```bash
# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# SMTP (for sending emails)
SMTP_HOST=smtp.sendprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
```

## 📁 Files Created

### Core Library
- `/src/lib/template.ts` - Handlebars-style template renderer

### API Routes
- `/src/app/api/campaigns/enqueue/route.ts` - Create campaign & queue contacts
- `/src/app/api/send/worker/route.ts` - Process pending messages in batches
- `/src/app/api/_internal/campaigns/list/route.ts` - List campaigns for UI

### UI
- `/src/app/(dashboard)/campaigns/page.tsx` - Campaign management dashboard

## 🚀 Testing the System

### Step 1: Start Development Server

```bash
npm run dev
# or
pnpm dev
# or
yarn dev
```

### Step 2: Create a Campaign and Queue Contacts

```bash
curl -s -X POST http://localhost:3000/api/campaigns/enqueue \
  -H "Content-Type: application/json" \
  -d '{
    "campaign": {
      "name": "Founders - Oct 2025",
      "sender_email": "you@yourdomain.com",
      "subject_template": "Quick intro, {{first_name}}?",
      "body_template": "<p>Hey {{first_name}},</p><p>We built SmartSend AI to auto-book calls when prospects reply.</p><p>Worth a quick 7-min intro?</p><p>— Julian</p>"
    },
    "limit": 5
  }'
```

**Response:**
```json
{
  "campaign_id": "uuid-here",
  "queued": 5
}
```

**What this does:**
- Creates (or reuses) a campaign with the given name
- Fetches up to 5 contacts from your `contacts` table
- Filters out suppressed emails/domains
- Creates pending messages in the queue
- Marks campaign as "running"

### Step 3: Process the Queue

Replace `<CAMPAIGN_ID>` with the ID from Step 2:

```bash
curl -s -X POST http://localhost:3000/api/send/worker \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "<CAMPAIGN_ID>",
    "batch_size": 20
  }'
```

**Response:**
```json
{
  "sent": 5,
  "skipped": 0,
  "failed": 0
}
```

**What this does:**
- Fetches up to 20 pending messages for the campaign
- For each message:
  - Checks Send Safety (daily caps, bounce guard)
  - Renders subject/body with contact data
  - Sends via SMTP
  - Updates message status
- Returns counts of sent/skipped/failed

### Step 4: View in the UI

Open http://localhost:3000/campaigns in your browser to:
- See all campaigns and their status
- Click "Run 20 sends" to process batches
- View real-time results (sent/skipped/failed counts)

## 🔍 Verification Checklist

- [ ] Campaigns table shows your campaign as "running"
- [ ] Messages transition through statuses: pending → sending → sent/failed/skipped
- [ ] Send Safety caps are respected (skipped with reason when exceeded)
- [ ] Suppressed emails/domains are filtered at enqueue time
- [ ] Emails arrive in recipient inboxes with personalized content
- [ ] Template variables like `{{first_name}}` are properly replaced

## 📊 Query Examples

### Check message status distribution:
```sql
SELECT status, COUNT(*) 
FROM messages 
WHERE campaign_id = '<your-campaign-id>'
GROUP BY status;
```

### View recent messages:
```sql
SELECT 
  recipient_email,
  status,
  skipped_reason,
  sent_at,
  last_error
FROM messages
WHERE campaign_id = '<your-campaign-id>'
ORDER BY attempted_at DESC
LIMIT 10;
```

### Check campaign stats:
```sql
SELECT 
  c.name,
  c.status,
  COUNT(m.id) FILTER (WHERE m.status = 'sent') as sent,
  COUNT(m.id) FILTER (WHERE m.status = 'failed') as failed,
  COUNT(m.id) FILTER (WHERE m.status = 'skipped') as skipped,
  COUNT(m.id) FILTER (WHERE m.status = 'pending') as pending
FROM campaigns c
LEFT JOIN messages m ON m.campaign_id = c.id
WHERE c.id = '<your-campaign-id>'
GROUP BY c.id, c.name, c.status;
```

## 🎯 Advanced Usage

### Filter by Contact IDs
```json
{
  "campaign": { ... },
  "contact_ids": ["uuid1", "uuid2", "uuid3"]
}
```

### Filter by Domain
```json
{
  "campaign": { ... },
  "filters": {
    "domain_in": ["example.com", "company.com"]
  }
}
```

### Custom Batch Size
```json
{
  "campaign_id": "uuid",
  "batch_size": 50
}
```

## 🔄 Integration with Send Safety

The worker automatically integrates with your existing Send Safety system:

1. **Daily Caps** - Respects per-sender email limits
2. **Bounce Guard** - Skips recipients with recent bounces
3. **Logging** - All sends are logged via `/api/send-safety/check-and-log`

Messages that fail Send Safety checks are marked as `skipped` with a reason like:
- `daily_cap_reached`
- `bounce_guard_triggered`
- `rate_limit_exceeded`

## 🛠️ Troubleshooting

### Campaign not found
- Verify the campaign_id is correct
- Check the campaigns table in Supabase

### All messages skipped
- Check your Send Safety settings
- Verify SMTP credentials are correct
- Look at `skipped_reason` field in messages table

### Send Safety check failed
- Ensure `/api/send-safety/check-and-log` endpoint exists
- Verify `NEXT_PUBLIC_APP_URL` is set correctly

### No contacts queued
- Verify contacts exist in your `contacts` table
- Check if they're all suppressed
- Review `suppressions` table for matching entries

## 📝 Notes

- **Dependencies**: `nodemailer` and `@types/nodemailer` are already installed
- **RLS**: Campaigns/messages use Row Level Security - reads are open to authenticated users, writes require service role
- **Concurrency**: The optimistic locking (pending → sending) helps prevent duplicate sends in concurrent workers
- **Template Syntax**: Use `{{field_name}}` for simple substitution, `{{object.nested}}` for nested fields
