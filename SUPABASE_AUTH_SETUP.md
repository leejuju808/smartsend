# Environment Variables Setup

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey... # For server-side operations
```

## Getting Your Supabase Credentials

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the Project URL and anon/public key
4. For the service role key, copy the service_role key (keep this secret!)

## Authentication Setup Complete

Your SmartSend AI application now has:

- ✅ Magic link authentication (no passwords required)
- ✅ Protected routes (`/dashboard`, `/settings`, `/sequences`)
- ✅ Automatic session management
- ✅ Sign-out functionality
- ✅ Server-side authentication helpers

## Next Steps

1. Set up your Supabase project with email authentication enabled
2. Configure your email templates in Supabase Auth settings
3. Test the magic link flow
4. Ready to integrate Stripe webhooks for subscription management