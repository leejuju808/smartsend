# New Campaign System Implementation

This document describes the new simplified email campaign system that works alongside your existing campaigns.

## Overview

The new system provides a streamlined approach to email campaigns with:
- Direct email sending via Brevo, MailerSend, or dev mode
- Batch processing with rate limiting
- Real-time progress tracking
- Pause/resume/cancel functionality
- Suppression list integration
- Unsubscribe footer and headers

## Environment Setup

Add these variables to your `.env.local`:

```bash
# Provider pick: brevo | mailersend | dev
EMAIL_PROVIDER=dev
EMAIL_FROM="SmartSend <no-reply@yourdomain.com>"

# Brevo (Sendinblue)
BREVO_API_KEY=replace_me

# MailerSend
MAILERSEND_TOKEN=replace_me
```

## Database Schema

The system creates new tables (`campaigns_new` and `campaign_recipients_new`) to avoid conflicts with your existing campaign system.

Run the migration:
```sql
-- See: supabase/migrations/20250120000000_create_campaign_tables.sql
```

## API Endpoints

### Create Campaign
- **POST** `/api/campaigns-new`
- Creates a new campaign in draft status

### Prepare Recipients
- **POST** `/api/campaigns/[id]/prepare`
- Loads recipients from contacts or custom email list
- Marks suppressed emails upfront

### Send Campaign
- **POST** `/api/campaigns/[id]/send-chunk`
- Processes batches of emails
- Handles retries and errors

### Progress Tracking
- **GET** `/api/campaigns/[id]/progress`
- Returns campaign statistics and status

### Campaign Control
- **POST** `/api/campaigns/[id]/pause` - Pause sending
- **POST** `/api/campaigns/[id]/resume` - Resume sending
- **POST** `/api/campaigns/[id]/cancel` - Cancel campaign

## UI Pages

### Main Interface
- `/dashboard/campaigns-new` - Create and manage campaigns

### Campaign Workflow
- `/dashboard/campaigns-new/[id]` - Campaign overview
- `/dashboard/campaigns-new/[id]/prepare` - Load recipients
- `/dashboard/campaigns-new/[id]/send` - Send console

## Quick Start

1. **Create a Campaign**
   - Go to `/dashboard/campaigns-new`
   - Fill out the form (name, subject, body, from email)
   - Click "Create Campaign"

2. **Prepare Recipients**
   - Click "Prepare Recipients"
   - Choose source: all contacts or custom emails
   - System will load and check suppression list

3. **Send Campaign**
   - Click "Send Campaign"
   - Use the send console to start, pause, or cancel
   - Monitor progress in real-time

## Features

### Email Providers
- **Brevo**: Full SMTP API integration
- **MailerSend**: REST API integration  
- **Dev Mode**: Console logging for testing

### Safety Features
- Suppression list checking
- Automatic unsubscribe headers
- Rate limiting (1.5s between batches)
- Retry logic (max 2 attempts)

### Progress Tracking
- Real-time status updates
- Batch processing stats
- Error reporting
- Completion detection

## Integration Notes

- Works alongside existing campaign system
- Uses same contacts and suppression tables
- Separate database tables to avoid conflicts
- Compatible with existing authentication

## Testing

1. Set `EMAIL_PROVIDER=dev` in `.env.local`
2. Create a test campaign
3. Add a few test email addresses
4. Run through the workflow
5. Check console logs for "DEV SEND" messages

## Production Setup

1. Choose your email provider (Brevo or MailerSend)
2. Set appropriate API keys
3. Update `EMAIL_FROM` with your domain
4. Test with small batches first
5. Monitor deliverability and reputation

## Troubleshooting

### Common Issues
- **Unauthorized**: Check user authentication
- **Table not found**: Run the database migration
- **Provider errors**: Verify API keys and limits
- **Rate limiting**: Increase delay between batches

### Debug Mode
Set `EMAIL_PROVIDER=dev` to see all email operations in console logs.

## Next Steps

- Add campaign templates
- Implement A/B testing
- Add analytics and reporting
- Integrate with existing dashboard
- Add bulk campaign management 