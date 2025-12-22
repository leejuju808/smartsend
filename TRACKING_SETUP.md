# Tracking Environment Variables

## Required Environment Variables

### Supabase Functions Secrets
Set these in Supabase Dashboard → Functions → Secrets:

- `TRACKING_HMAC_SECRET`: A random secret key for HMAC signing (generate with `openssl rand -hex 32`)
- `FUNCTIONS_BASE`: Your Supabase functions base URL (e.g., `https://your-project-ref.functions.supabase.co`)

### Next.js Environment Variables
Add to your `.env.local`:

- `TRACKING_HMAC_SECRET`: Same value as above
- `NEXT_PUBLIC_FUNCTIONS_BASE`: Same as `FUNCTIONS_BASE` above

## Setup Instructions

1. **Deploy the SQL migration:**
   ```bash
   supabase db push
   ```

2. **Deploy the edge functions:**
   ```bash
   supabase functions deploy track-open
   supabase functions deploy track-click
   ```

3. **Set the environment variables** in Supabase Dashboard → Functions → Secrets

4. **Test the tracking** by sending a test email and checking the dashboard badges

## How It Works

1. **Email Sending**: The `send-queue` function creates an email log entry and instruments the HTML with tracking pixels and wrapped links
2. **Open Tracking**: When the email is opened, the tracking pixel loads and calls `track-open` function
3. **Click Tracking**: When a link is clicked, it redirects through `track-click` function before going to the final destination
4. **Dashboard Updates**: The dashboard shows real-time updates of opened/clicked status via Supabase realtime subscriptions