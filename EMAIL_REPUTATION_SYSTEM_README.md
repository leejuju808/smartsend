# Email Reputation Management System

A comprehensive email reputation management system for SmartSend AI that protects sender reputation through automatic throttling, warmup curves, and bounce suppression.

## 🎯 Overview

This system automatically manages email sending limits based on domain reputation, implements gradual warmup curves, and handles bounces to maintain high deliverability rates.

## 🏗️ Architecture

### 1. Database Schema

#### Bounces Table
```sql
create table public.bounces (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  type text not null, -- hard|soft|complaint
  provider_message text,
  created_at timestamptz default now()
);
```

#### Profile Extensions
```sql
alter table public.profiles
  add column daily_send_cap int default 200,
  add column warmup_level int default 1;
```

#### Database Functions
- `get_daily_send_count(p_user_id)` - Count today's sends
- `can_send_today(p_user_id)` - Check if user can send today
- `increment_warmup()` - Daily warmup level increment

### 2. Core Components

#### Email Throttle Library (`/lib/email/throttle.ts`)
- `canSendToday(userId)` - Check daily send limits
- `getDailySendCount(userId)` - Get today's send count
- `incrementWarmupLevel()` - Increment warmup for all users
- `updateProfileWarmup()` - Update user warmup settings

#### Bounce Webhook (`/api/inbound/bounce`)
- Receives bounce notifications from ESPs (Brevo, MailerSend)
- Records bounces in database
- Automatically suppresses hard bounces and complaints
- Supports testing via GET requests

#### Reputation API (`/api/reputation`)
- GET: Returns user's reputation data
- POST: Updates warmup settings
- Provides daily caps, warmup levels, bounce counts

#### Reputation UI (`/dashboard/settings/reputation`)
- Displays current status and warmup curve
- Allows editing daily caps and warmup levels
- Shows bounce statistics and management info

## 🚀 Setup Instructions

### 1. Database Migration
Run the SQL migration in Supabase:
```bash
# Copy and paste the contents of:
supabase/migrations/20250120000000_email_reputation_system.sql
```

### 2. Environment Variables
Ensure these are set in your `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. ESP Webhook Configuration
Configure your email service provider to POST bounces to:
```
https://yourdomain.com/api/inbound/bounce
```

**Brevo Example:**
```json
{
  "email": "user@example.com",
  "type": "hard",
  "campaign_id": "uuid-here",
  "message": "User not found"
}
```

**MailerSend Example:**
```json
{
  "email": "user@example.com",
  "type": "complaint",
  "campaign_id": "uuid-here"
}
```

### 4. Daily Warmup Cron Job
Set up a daily cron job to increment warmup levels:

```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * cd /path/to/smartsend-ai && npm run warmup:increment

# Or run manually
npm run warmup:increment
```

## 📊 How It Works

### Warmup Curve
- **Level 1**: 50 emails/day (starting point)
- **Level 5**: 250 emails/day
- **Level 10**: 500 emails/day
- **Level 20**: 1000 emails/day
- **Maximum**: Your daily cap (default: 200)

### Daily Throttling
1. User attempts to send emails
2. System checks `can_send_today()` function
3. If daily limit reached → blocked with 429 status
4. If under limit → allowed to proceed

### Bounce Handling
1. ESP sends bounce webhook to `/api/inbound/bounce`
2. System records bounce in `bounces` table
3. Hard bounces/complaints → immediately suppressed
4. Soft bounces → tracked for monitoring

## 🔧 Integration Points

### Send Engine Integration
In your campaign send engine, add this check:

```typescript
import { canSendToday } from "@/lib/email/throttle";

// Before sending emails
const check = await canSendToday(userId);
if (!check.ok) {
  return NextResponse.json({ 
    halted: true, 
    reason: "daily cap reached", 
    cap: check.cap, 
    used: check.used 
  }, { status: 429 });
}
```

### Campaign Recipients Status
Update your `campaign_recipients` table to include:
- `status` column with values: `queued`, `sent`, `failed`, `skipped`, `bounced`
- `sent_at` timestamp for daily counting

## 🧪 Testing

### Test Bounce Webhook
```bash
# Test hard bounce
curl "http://localhost:3000/api/inbound/bounce?email=test@example.com&type=hard&campaign_id=123"

# Test complaint
curl "http://localhost:3000/api/inbound/bounce?email=test@example.com&type=complaint"
```

### Test Warmup Increment
```bash
npm run warmup:increment
```

### Test Reputation API
```bash
# Get reputation data
curl "http://localhost:3000/api/reputation"

# Update settings
curl -X POST "http://localhost:3000/api/reputation" \
  -H "Content-Type: application/json" \
  -d '{"daily_send_cap": 500, "warmup_level": 5}'
```

## 📈 Monitoring

### Key Metrics to Track
- Daily send counts vs. caps
- Warmup level progression
- Bounce rates by type
- Suppression list growth

### Dashboard Access
Navigate to `/dashboard/settings/reputation` to view:
- Current warmup level and daily cap
- Today's send usage
- 30-day bounce statistics
- Warmup curve visualization

## 🛡️ Security Features

- **RLS Policies**: Users can only see their own bounces
- **Service Role**: Bounce webhook uses service role for inserts
- **Input Validation**: All inputs validated and sanitized
- **Rate Limiting**: Daily caps prevent abuse

## 🔄 Maintenance

### Daily Tasks
- Run warmup increment cron job
- Monitor bounce rates and suppression growth

### Weekly Tasks
- Review warmup level distribution
- Check for unusual bounce patterns

### Monthly Tasks
- Analyze warmup curve effectiveness
- Adjust base caps if needed

## 🚨 Troubleshooting

### Common Issues

**Bounce webhook not working:**
- Check ESP webhook configuration
- Verify service role key permissions
- Check server logs for errors

**Warmup not incrementing:**
- Verify cron job is running
- Check database function exists
- Review service role permissions

**Daily caps not enforced:**
- Ensure `can_send_today()` is called
- Verify campaign_recipients status tracking
- Check database function permissions

### Debug Commands
```bash
# Check if warmup function exists
psql -d your_db -c "SELECT routine_name FROM information_schema.routines WHERE routine_name = 'increment_warmup';"

# Check warmup levels
psql -d your_db -c "SELECT warmup_level, daily_send_cap FROM profiles ORDER BY warmup_level DESC LIMIT 10;"

# Check today's sends
psql -d your_db -c "SELECT get_daily_send_count('user-uuid-here');"
```

## 📚 Additional Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Email Deliverability Best Practices](https://sendgrid.com/blog/email-deliverability-best-practices/)
- [Bounce Management Guide](https://mailchimp.com/help/about-bounces/)

## 🤝 Contributing

When modifying the reputation system:
1. Update database migrations
2. Test with various bounce scenarios
3. Verify warmup curve calculations
4. Update this documentation

---

**Note**: This system is designed to be conservative with sending limits to protect sender reputation. Adjust base caps and warmup curves based on your specific domain reputation and ESP requirements. 