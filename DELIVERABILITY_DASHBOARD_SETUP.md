# Deliverability Dashboard Setup Guide

Complete implementation of SmartSend's Deliverability Dashboard with domain verification (SPF, DKIM, DMARC), health scoring, and automatic monitoring.

## ✅ Features Implemented

1. **Database Schema** - `sender_domains` table with RLS policies
2. **Edge Function** - `domain-verify` to check DNS records
3. **Server Action** - Trigger domain verification from UI
4. **Deliverability Dashboard UI** - Domain verification interface with heatmap
5. **Auto-insert Trigger** - Automatically creates domain records when sender profiles are added
6. **Cron Job** - Periodic re-verification every 3 days

## 📋 Setup Instructions

### 1. Database Migration

Apply the migrations in Supabase SQL Editor:

```bash
# Migration 1: Create sender_domains table
supabase/migrations/20250124000000_sender_domains.sql

# Migration 2: Set up cron job
supabase/migrations/20250124000001_domain_verify_cron.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

Deploy the `domain-verify` edge function:

```bash
cd supabase
supabase functions deploy domain-verify --no-verify-jwt
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → `domain-verify` → Settings:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DOMAIN_SECRET=your-random-secret-string
```

**Also set in Next.js environment (`.env.local`):**
```
DOMAIN_SECRET=your-random-secret-string (same as above)
```

### 4. Configure Cron Job Settings

The cron job uses Supabase's `pg_cron` extension. Make sure these settings are configured in Supabase:

```sql
-- Set app settings for cron job (run in Supabase SQL Editor)
ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';
ALTER DATABASE postgres SET app.domain_secret = 'your-random-secret-string';
```

Alternatively, you can configure the cron job directly via Supabase Dashboard → Database → Cron Jobs.

## 🎯 How It Works

### Domain Verification Flow

1. **User adds sender profile** → Trigger automatically extracts domain from email and inserts into `sender_domains`
2. **User clicks "Check" in dashboard** → Server action calls edge function → DNS records checked → Results stored
3. **Cron job runs daily** → Re-verifies all domains not checked in last 3 days

### Health Score Calculation

- **SPF Pass**: +33 points
- **DKIM Pass**: +33 points  
- **DMARC Pass**: +34 points
- **Total**: 0-100 score

### Visual Indicators

- **Green (67-100)**: Good - All or most records passing
- **Yellow (33-66)**: Warning - Some records missing
- **Red (0-32)**: Critical - Most records missing

## 🔍 Testing

### Manual Test

1. Go to `/settings/deliverability`
2. Enter a domain (e.g., `yourdomain.com`)
3. Click "Check"
4. Verify results show SPF/DKIM/DMARC status

### Test with Sender Profile

1. Add a sender profile with email `you@yourdomain.com`
2. Check `sender_domains` table - domain should auto-insert
3. Verify domain in dashboard

### Test Cron Job

Manually trigger batch verification:
```sql
SELECT net.http_post(
  url := 'https://your-project.supabase.co/functions/v1/domain-verify',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-ss-secret', 'your-domain-secret'
  ),
  body := jsonb_build_object('batch', true)
);
```

## 📊 Integration Points

### Merge with Sender Health

To integrate domain health with sender health scores:

```sql
-- Example: Create view that combines domain + sender health
CREATE VIEW v_sender_health_complete AS
SELECT 
  sp.id,
  sp.email,
  sp.daily_limit,
  sd.health_score as domain_health,
  -- Add your sender health calculation here
  COALESCE(sd.health_score, 0) * 0.3 + /* sender metrics */ * 0.7 as combined_health
FROM sender_profiles sp
LEFT JOIN sender_domains sd ON 
  extract_domain_from_email(sp.email) = sd.domain;
```

### Campaign Launch Warnings

Add warning banner in campaign launch flow:

```typescript
// Example: Check domain health before launch
const { data: domain } = await supabase
  .from('sender_domains')
  .select('health_score, spf_pass, dkim_pass, dmarc_pass')
  .eq('domain', extractDomain(senderEmail))
  .single();

if (domain && domain.health_score < 67) {
  // Show warning: "Domain authentication incomplete"
}
```

## 🚨 Troubleshooting

### Edge Function Not Working

- Verify `DOMAIN_SECRET` matches in both Supabase and Next.js env
- Check edge function logs in Supabase Dashboard
- Ensure `domain-verify` function is deployed with `--no-verify-jwt`

### Cron Job Not Running

- Verify `pg_cron` extension is enabled
- Check cron job exists: `SELECT * FROM cron.job WHERE jobname = 'domain-verify-batch';`
- View cron logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### DNS Checks Failing

- Verify DNS module is available in Deno runtime
- Check domain format (no http://, www., etc.)
- Some domains may take time to propagate DNS changes

## 📝 Files Created

- `supabase/migrations/20250124000000_sender_domains.sql` - Database schema
- `supabase/migrations/20250124000001_domain_verify_cron.sql` - Cron job setup
- `supabase/functions/domain-verify/index.ts` - Edge function
- `src/app/settings/deliverability/actions.ts` - Server action
- `src/app/settings/deliverability/page.tsx` - Updated UI (domain verification section added)

## 🎉 Next Steps

1. Deploy migrations and edge function
2. Set environment variables
3. Test domain verification
4. Configure cron job settings
5. Integrate health warnings into campaign launch flow (optional)

## 📚 Additional Notes

- Domain records are unique per team
- Auto-insert trigger fires on `sender_profiles` INSERT
- Cron job processes up to 100 domains per run
- Health score updates automatically on verification

