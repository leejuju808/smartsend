# Environment Configuration

Add the following to your `.env.local` file:

```bash
# Encryption for SMTP secrets (32-byte key: either a 32-char UTF-8 string or base64 of 32 bytes)
ENCRYPTION_KEY=32byteslongsecretstringgoeshere!!!

# Supabase configuration (your existing keys)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=https://your-project.functions.supabase.co

# Calendar OAuth providers (Google & Microsoft)
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=https://YOUR_APP_DOMAIN/api/oauth/google/callback
MS_CLIENT_ID=xxxx-xxxx...
MS_CLIENT_SECRET=xxxx
MS_REDIRECT_URI=https://YOUR_APP_DOMAIN/api/oauth/outlook/callback

# If you still use default SMTP for older slices, keep those too (not used by this per-account flow)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=your_password
SMTP_FROM_EMAIL=noreply@example.com
SMTP_FROM_NAME=SmartSend AI
```

## Important Notes

1. **ENCRYPTION_KEY**: Must be exactly 32 bytes. You can either:
   - Use a 32-character UTF-8 string: `abcdefghijklmnopqrstuvwxyz123456`
   - Use a base64-encoded 32-byte key: Generate with `openssl rand -base64 32`

2. **Security**: Never commit the actual `.env.local` file to version control. The encryption key is critical for decrypting SMTP passwords.

3. **Testing**: For development, you can use a simple 32-character string like the example above.

## Billing / Stripe Checklist

Make sure these are configured before enabling payments:

- `NEXT_PUBLIC_EDGE_URL` – Supabase Functions base URL (e.g. `https://<project>.functions.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL` – Same as `NEXT_PUBLIC_EDGE_URL`; used by the Inbox reply composer to call the `inbox-reply` Edge Function
- `APP_ORIGIN` – Public URL of the Next.js app (used for Stripe redirects)
- `STRIPE_SECRET_KEY` – Stripe secret API key
- `STRIPE_WEBHOOK_SECRET` – Secret for the webhook endpoint
- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM` – Subscription price IDs