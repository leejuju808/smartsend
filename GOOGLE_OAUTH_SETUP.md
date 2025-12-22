# Google OAuth Integration Setup

## Environment Variables

Add the following variables to your `.env.local` file:

```bash
# Google OAuth Configuration
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id_here
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Encryption Secret (for token encryption)
ENCRYPTION_SECRET=your_encryption_secret_here

# Supabase Configuration (if not already present)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

## Google Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set the application type to "Web application"
6. Add authorized redirect URI: `https://YOUR_DOMAIN/api/oauth/google/callback`
7. Copy the Client ID and Client Secret to your `.env.local` file

## Database Migration

Run the migration to set up email accounts table constraints:

```bash
supabase db push
```

## Usage

1. Users can now connect their Gmail accounts via the Settings page
2. The OAuth flow will encrypt and store access/refresh tokens securely
3. Use the `dec()` function from `@/lib/crypto` to decrypt tokens when making Gmail API calls

## Security Notes

- Tokens are encrypted at rest using AES-256-GCM
- The encryption key is derived from the `ENCRYPTION_SECRET` environment variable
- Email accounts are unique per workspace
- RLS policies ensure users can only access their own accounts