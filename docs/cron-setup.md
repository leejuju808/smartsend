# Monthly Send Reset Cron Job Setup

## Option 1: Supabase Cron (Recommended)

Add this to your Supabase dashboard under Database > Functions:

```sql
-- Create a cron job that runs daily at midnight
select cron.schedule(
  'reset-monthly-sends',
  '0 0 * * *', -- Daily at midnight
  'select public.reset_monthly_sends();'
);
```

## Option 2: External Cron Service

If using an external cron service (like GitHub Actions, Vercel Cron, etc.), make a POST request to:

```
POST https://your-project.supabase.co/functions/v1/cron-monthly-reset
```

## Option 3: Manual Reset

You can manually reset monthly sends by running:

```sql
select public.reset_monthly_sends();
```

## Testing

To test the reset function:

1. Set a profile's `monthly_sends` to a high number
2. Run the reset function
3. Verify `monthly_sends` is set to 0 and `last_reset` is updated

## Monitoring

Check the Supabase logs to ensure the cron job is running successfully. 