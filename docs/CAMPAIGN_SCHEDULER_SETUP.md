# Campaign Scheduler Setup Guide

## Supabase Scheduler Configuration

To enable automatic campaign processing, you need to configure Supabase Scheduler to run the `send-queue` edge function every minute.

### Step 1: Deploy the Edge Function

First, deploy the send-queue function:

```bash
supabase functions deploy send-queue
```

### Step 2: Configure Scheduler in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **Extensions** → **pg_cron**
3. Enable the pg_cron extension if not already enabled

### Step 3: Create Scheduled Job

Run this SQL command in your Supabase SQL editor to create a cron job that runs every minute:

```sql
-- Create a cron job to run the send-queue function every minute
SELECT cron.schedule(
  'send-queue-processor',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'https://your-project-ref.supabase.co/functions/v1/send-queue',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

**Important**: Replace `your-project-ref` with your actual Supabase project reference.

### Step 4: Verify Setup

You can verify the cron job was created by running:

```sql
SELECT * FROM cron.job;
```

### Step 5: Monitor Execution

To monitor the cron job execution:

```sql
SELECT * FROM cron.job_run_details 
WHERE jobname = 'send-queue-processor' 
ORDER BY start_time DESC 
LIMIT 10;
```

### Alternative: Using Supabase Dashboard Scheduler

If you prefer using the Supabase dashboard:

1. Go to **Database** → **Scheduler**
2. Click **New Job**
3. Configure:
   - **Name**: `send-queue-processor`
   - **Schedule**: `* * * * *` (every minute)
   - **Target**: Edge Function
   - **Function**: `send-queue`
   - **Method**: POST
   - **Headers**: `{"Content-Type": "application/json"}`
   - **Body**: `{}`

### Testing the Setup

1. Create a test campaign with a scheduled time in the near future
2. Wait for the scheduled time to pass
3. Check the `campaign_recipients` table to see if status changes from `queued` to `sending` to `sent`
4. Check the `email_logs` table for new entries

### Troubleshooting

- **Function not executing**: Check the cron job status in `cron.job_run_details`
- **Permission errors**: Ensure the service role key has proper permissions
- **Function errors**: Check the Supabase Functions logs in the dashboard

### Environment Variables Required

Make sure these environment variables are set in your Supabase project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROVIDER_API_KEY` (for email sending)

### Security Notes

- The cron job uses the service role key for authentication
- The function includes proper error handling and logging
- Campaigns are processed with workspace-level security policies
- Failed emails are marked appropriately for retry or manual review