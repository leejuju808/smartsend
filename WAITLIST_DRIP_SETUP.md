# Waitlist Drip Email System Setup

This system automatically sends follow-up emails to waitlist subscribers based on days since signup.

## 🗄️ Database Setup

The required tables are already created via migrations:
- `waitlist` - stores email signups
- `waitlist_emails` - tracks sent emails (prevents duplicates)
- `suppression_list` - global unsubscribe list

## 📧 Email Flow

1. **Day 0**: Welcome email with product overview
2. **Day 2**: Case study showing real workflow
3. **Day 5**: Strong CTA to start trial

## 🚀 Quick Start

### 1. Set GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions, add:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_api_key
RESEND_FROM=your_from_email@domain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### 2. Test the System

```bash
# Test database connectivity and env vars
npm run waitlist:test

# Manually run drip emails (for testing)
npm run waitlist:drip
```

### 3. Test Unsubscribe

1. Add your email to the waitlist via homepage
2. Check `/unsubscribe` page works
3. Verify email lands in `suppression_list` table

## 🔧 How It Works

### Database Tables

- **`waitlist`**: Email signups with timestamps
- **`waitlist_emails`**: Tracks which emails were sent to prevent duplicates
- **`suppression_list`**: Global unsubscribe list (shared across all email types)

### Email Logic

The script calculates days since signup and sends appropriate emails:
- Prevents duplicate sends via `waitlist_emails` table
- Respects unsubscribes via `suppression_list` table
- Sends emails at specific day intervals

### Unsubscribe Flow

1. User visits `/unsubscribe`
2. Enters email and submits
3. Email added to `suppression_list` table
4. Future drip emails skip this address

## 📅 Automation

The GitHub Action runs daily at 15:00 UTC:
- Automatically processes new waitlist signups
- Sends emails based on timing rules
- Logs all sends to `waitlist_emails` table

## 🧪 Testing

### Manual Test
```bash
npm run waitlist:drip
```

### Check Database
```sql
-- See all sent emails
SELECT * FROM waitlist_emails ORDER BY sent_at DESC;

-- Check suppression list
SELECT * FROM suppression_list ORDER BY created_at DESC;

-- Verify waitlist signups
SELECT * FROM waitlist ORDER BY created_at DESC;
```

## 🔒 Privacy & Compliance

- **Consent**: Waitlist form includes "By joining, you agree to receive product tips. Unsubscribe anytime."
- **Unsubscribe**: One-click unsubscribe via `/unsubscribe` page
- **Suppression**: Global suppression list prevents future emails
- **Logging**: All sends logged with timestamps for audit trail

## 🚨 Troubleshooting

### Common Issues

1. **Emails not sending**: Check Resend API key and from address
2. **Database errors**: Verify Supabase connection and table permissions
3. **Missing env vars**: Check GitHub Secrets are set correctly

### Debug Commands

```bash
# Test database connection
npm run waitlist:test

# Check logs in GitHub Actions
# Go to Actions → Waitlist Drip → View logs
```

## 📝 Customization

### Modify Email Content

Edit `scripts/send-waitlist-drip.ts` to change:
- Email subjects and body text
- Timing intervals (currently 0, 2, 5 days)
- Email types and content

### Change Schedule

Modify `.github/workflows/waitlist-drip.yml`:
- Change cron schedule (currently daily at 15:00 UTC)
- Add manual trigger options

### Add Email Types

1. Add new type to `waitlist_emails.type` enum
2. Add new email logic in the script
3. Update database migration if needed

## ✅ Success Metrics

Track these in your analytics:
- Waitlist signup conversion rate
- Email open rates by type
- Trial signup rate from drip emails
- Unsubscribe rate (should be low)

---

**Need help?** Check the GitHub Actions logs or run `npm run waitlist:test` to diagnose issues. 