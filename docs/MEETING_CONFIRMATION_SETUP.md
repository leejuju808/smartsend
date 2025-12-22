# Meeting Confirmation System Setup

This document describes the implementation of the meeting confirmation system that automatically sends confirmation emails with .ics attachments when meetings are booked.

## Overview

The system consists of:
1. **SMTP Configuration** - Email sending setup
2. **Mailer Library** - Handles email composition and sending
3. **Meeting Booking API** - Updates meeting status and triggers confirmation emails
4. **Test Script** - Verifies the system works correctly

## 1. Environment Configuration

Add these SMTP variables to your `.env` file:

```bash
# SMTP Configuration for meeting confirmations
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=super-secret
FROM_EMAIL=no-reply@smartsend.ai

# Internal webhook secret for API authentication
INTERNAL_WEBHOOK_SECRET=your_internal_webhook_secret_here
```

### Recommended SMTP Providers:
- **Brevo (formerly Sendinblue)**: `smtp.brevo.com:587`
- **Mailersend**: `smtp.mailersend.net:587`
- **Mailgun**: `smtp.mailgun.org:587`
- **Amazon SES**: `email-smtp.us-east-1.amazonaws.com:587`

## 2. Database Schema

The system uses the existing `meetings` table with these fields:
- `id` - Meeting identifier
- `status` - Meeting status (updated to 'booked')
- `booked_at` - Timestamp when meeting was booked
- `contact_email` - Recipient email address
- `ics` - Calendar file content
- `start_at` - Meeting start time
- `subject` - Meeting subject
- `location` - Meeting location (optional)

## 3. API Usage

### Book a Meeting

```bash
curl -sS http://localhost:3000/api/meetings/book \
  -H "Authorization: Bearer $INTERNAL_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"meetingId":"YOUR_MEETING_ID"}'
```

**Response:**
```json
{
  "ok": true,
  "meeting": {
    "id": "meeting_id",
    "status": "booked",
    "booked_at": "2024-01-15T10:00:00.000Z",
    "contact_email": "prospect@example.com",
    "subject": "Intro Call",
    "start_at": "2024-01-15T10:00:00.000Z"
  }
}
```

### Authentication

The API accepts authentication via:
- `Authorization: Bearer <secret>` header
- `?secret=<secret>` query parameter

Both methods use the `INTERNAL_WEBHOOK_SECRET` environment variable.

## 4. Email Confirmation

When a meeting is booked, the system automatically sends a confirmation email containing:

- **Subject**: "Meeting confirmed: {subject}"
- **Text Content**: Confirmation message with meeting details
- **ICS Attachment**: Calendar file for calendar integration
- **Alternative Content**: Calendar content for email clients that support it

### Email Template

```
Hi {name},

Your meeting is confirmed!

When: {start_time}
Where: {location or 'Video'}

See you soon.

— SmartSend AI
```

## 5. Testing

### Run the Test Script

```bash
# Install dependencies if needed
npm install --save-dev @types/nodemailer

# Run the test
tsx scripts/test-meeting-booking.ts
```

### Manual Testing

1. Set up your SMTP credentials in `.env`
2. Find a meeting ID from your database
3. Update the script with the real meeting ID
4. Run the test script
5. Check the recipient's inbox for the confirmation email

## 6. Troubleshooting

### Common Issues

**"SMTP not configured" error:**
- Verify all SMTP environment variables are set
- Check SMTP credentials are correct
- Ensure SMTP provider allows authentication

**"Unauthorized" error:**
- Verify `INTERNAL_WEBHOOK_SECRET` is set correctly
- Check the Authorization header or secret query parameter

**Email not received:**
- Check SMTP logs for errors
- Verify recipient email address is valid
- Check spam/junk folders

### Debug Mode

Enable debug logging by adding to your environment:
```bash
DEBUG=nodemailer:*
```

## 7. Next Steps

After implementing this system, consider adding:

1. **Analytics Dashboard** (`/dashboard/analytics`)
   - MB/100 (meetings booked ÷ 100 replies)
   - Reply→Meeting conversion percentage
   - Sender health metrics (bounces, opens)

2. **Email Templates**
   - Customizable confirmation email templates
   - Multiple language support
   - Brand customization

3. **Calendar Integration**
   - Google Calendar API integration
   - Outlook calendar support
   - Calendar availability checking

## 8. Security Considerations

- Keep `INTERNAL_WEBHOOK_SECRET` secure and random
- Use HTTPS in production
- Consider rate limiting for the booking API
- Validate meeting IDs to prevent unauthorized access
- Log all booking attempts for audit purposes 