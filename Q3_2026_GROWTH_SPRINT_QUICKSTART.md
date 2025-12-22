# Q3 2026 Growth Sprint - Quick Start

**Get the growth engine running in 5 minutes**

## Step 1: Apply Database Migration (2 min)

```bash
# Open Supabase Dashboard → SQL Editor
# Copy and paste: supabase/migrations/20250301000000_growth_sprint_q3_2026.sql
# Click "Run"
```

Or via CLI:
```bash
supabase db push
```

✅ You now have:
- Growth funnel tracking
- Marketing posts table
- Referral tracking system
- Growth agents templates
- Metrics dashboard view

## Step 2: Deploy Edge Functions (2 min)

### Content Bot
```bash
supabase functions deploy content-bot

# Set secrets in Supabase Dashboard → Edge Functions → Settings:
# OPENAI_API_KEY=your_key

# Schedule weekly:
# Edge Functions → content-bot → Schedule → Add Schedule
# Cron: 0 9 * * 1  (Every Monday at 9 AM)
```

### Referral Payouts
```bash
supabase functions deploy referral-payouts

# Set secrets:
# STRIPE_SECRET_KEY=your_key

# Schedule monthly:
# Cron: 0 10 1 * *  (1st of month at 10 AM)
```

✅ Growth automation engines are now live!

## Step 3: Access Dashboard (30 sec)

Navigate to: **`http://localhost:3000/growth`**

Or if using monorepo: **`http://localhost:3000/apps/hq/growth`**

You should see:
- Active Orgs count
- Monthly Signups
- ARR with target progress
- Growth engines status

## Step 4: Test Content Generation (30 sec)

```bash
# Manually trigger content bot
supabase functions invoke content-bot --no-verify-jwt

# Check results in Supabase Dashboard → Table Editor → marketing_posts
# You should see draft posts created
```

✅ AI is generating weekly content automatically!

## Step 5: Set Up Daily Funnel Updates (30 sec)

```sql
-- In Supabase SQL Editor
SELECT cron.schedule(
  'update-growth-funnels-daily',
  '0 1 * * *',  -- Every day at 1 AM
  $$
  SELECT public.update_growth_funnels_daily();
  $$
);
```

✅ Attribution tracking is now automated!

---

## What's Working Now

✅ **Funnel Tracking**: Analytics events → growth_funnels aggregation  
✅ **AI Content**: Weekly blog/case study generation  
✅ **Referral System**: Commission tracking + payouts  
✅ **Growth Dashboard**: Real-time metrics display  
✅ **Growth Agents**: Pre-built sequences ready  

## Next Actions

1. **Review AI Content**: Check `marketing_posts` table, approve drafts
2. **Configure Referrals**: Set up Stripe Connect for referrers
3. **Launch Agents**: Activate growth sequences in SmartSend
4. **Monitor Metrics**: Watch ARR trajectory in dashboard

## Troubleshooting

**Dashboard shows zeros?**
→ Check that migration applied successfully:
```sql
SELECT * FROM growth_metrics_summary;
```

**Content bot fails?**
→ Verify OPENAI_API_KEY is set:
```bash
supabase secrets list
```

**Referral payouts fail?**
→ Check STRIPE_SECRET_KEY and test Stripe connection:
```bash
supabase functions invoke referral-payouts --no-verify-jwt
```

---

**Setup Complete!** 🎉  
Your growth engine is now systematized and scaling.

See full documentation: `Q3_2026_GROWTH_SPRINT_IMPLEMENTATION.md`
