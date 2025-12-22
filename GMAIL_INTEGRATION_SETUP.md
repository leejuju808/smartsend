# Gmail Sender Integration Setup Guide

This guide will help you set up the Gmail Sender Integration for SmartSend AI, which allows users to send emails directly through their Gmail accounts using OAuth2 authentication.

## Prerequisites

1. Google Cloud Console project with Gmail API enabled
2. Supabase project with Edge Functions enabled
3. Environment variables configured

## Setup Steps

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized redirect URIs:
     - `https://your-project-ref.functions.supabase.co/oauth-gmail-callback`
   - Copy the Client ID and Client Secret

### 2. Supabase Environment Variables

Set these environment variables in your Supabase project:

```bash
# In Supabase Dashboard > Settings > Edge Functions > Environment Variables
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://your-project-ref.functions.supabase.co/oauth-gmail-callback
APP_URL=https://your-app-domain.com
```

### 3. Next.js Environment Variables

Add these to your `.env.local` file:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://your-project-ref.functions.supabase.co/oauth-gmail-callback
```

### 4. Deploy Edge Functions

Deploy the Edge Functions to Supabase:

```bash
# Deploy provider-send function
supabase functions deploy provider-send

# Deploy oauth-gmail-callback function
supabase functions deploy oauth-gmail-callback
```

### 5. Run Database Migration

Apply the database migration:

```bash
supabase db push
```

## How It Works

### 1. OAuth Flow
- User clicks "Connect Gmail" in the integrations page
- Redirected to Google OAuth consent screen
- After consent, redirected to `oauth-gmail-callback` function
- Function exchanges authorization code for tokens
- Tokens stored securely in `user_email_providers` table

### 2. Email Sending
- Queue dispatcher checks if user has Gmail provider configured
- If yes, calls `provider-send` function with email details
- Function refreshes access token if needed
- Builds MIME message and sends via Gmail API
- Updates email logs and campaign recipient status

### 3. Token Management
- Refresh tokens stored securely in database
- Access tokens automatically refreshed when expired
- RLS policies ensure users can only access their own tokens

## Testing

### 1. Connect Gmail Account
1. Go to `/dashboard/integrations`
2. Click "Connect Gmail" in the Gmail Integration section
3. Complete OAuth flow
4. Verify account appears in connected accounts

### 2. Send Test Email
1. Create a campaign or sequence
2. Add a test recipient
3. Send the campaign
4. Check that email is sent via Gmail (check Gmail Sent folder)

### 3. Verify Logs
1. Check `email_logs` table for delivery status
2. Check `campaign_recipients` table for sent status
3. Verify Gmail message ID is recorded

## Troubleshooting

### Common Issues

1. **OAuth Error**: Check redirect URI matches exactly
2. **Token Refresh Failed**: Verify client credentials are correct
3. **Gmail Send Failed**: Check Gmail API is enabled and user has send permissions
4. **Database Errors**: Ensure migration was applied and RLS policies are correct

### Debug Steps

1. Check Supabase Edge Function logs
2. Verify environment variables are set correctly
3. Test OAuth flow manually
4. Check Gmail API quotas and limits

## Security Considerations

- Refresh tokens are stored encrypted in database
- RLS policies prevent cross-user access
- Access tokens are short-lived and auto-refreshed
- All API calls use HTTPS
- User consent required for Gmail access

## API Endpoints

- `POST /functions/v1/provider-send` - Send email via Gmail
- `GET /functions/v1/oauth-gmail-callback` - OAuth callback handler

## Database Tables

- `user_email_providers` - Stores OAuth tokens per user/workspace
- `email_logs` - Tracks email delivery status
- `campaign_recipients` - Campaign recipient status

## Support

For issues or questions:
1. Check Supabase Edge Function logs
2. Verify Google Cloud Console configuration
3. Test OAuth flow independently
4. Check database permissions and RLS policies