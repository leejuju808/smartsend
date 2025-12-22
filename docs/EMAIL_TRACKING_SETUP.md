# Email Tracking Environment Variables

Add these environment variables to your Vercel deployment:

## Required Variables

```bash
# Tracking secret for signing/verifying tracking tokens
TRACKING_SECRET=your_long_random_string_here

# Public app URL for generating tracking links
PUBLIC_APP_URL=https://your-app-domain.com

# Existing Supabase variables (should already be set)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## How to Generate TRACKING_SECRET

Generate a secure random string for the tracking secret:

```bash
# Option 1: Using openssl
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Using online generator
# Visit: https://generate-secret.vercel.app/32
```

## Setting in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable for Production, Preview, and Development environments

## Testing

After setting up the environment variables:

1. Run the migration: `supabase db push`
2. Send a test email through your application
3. Check the `email_events` table for tracking data
4. Verify pixel and click tracking URLs work correctly