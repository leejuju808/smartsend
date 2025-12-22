# Environment Variables Setup

Copy these to your `.env.local` file:

```env
# ========================================
# Auto-Calendar Insert Feature
# ========================================

# SMTP Configuration (for sending invite emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="SmartSend AI <your-email@gmail.com>"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: Customize meeting organizer details
MEETING_ORGANIZER_EMAIL=founder@smartsend.ai
MEETING_ORGANIZER_NAME=SmartSend AI Team
```

## How to Get SMTP Credentials

### Gmail (Recommended for Testing)

1. Enable 2-Factor Authentication on your Google Account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password
4. Use this App Password as `SMTP_PASS`

### SendGrid, Mailgun, or Resend

For production, consider using a dedicated email service:

- **SendGrid**: https://sendgrid.com/
- **Mailgun**: https://mailgun.com/
- **Resend**: https://resend.com/

Update the SMTP settings accordingly based on your provider.
