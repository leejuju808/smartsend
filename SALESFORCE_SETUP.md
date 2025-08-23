# Salesforce Integration Setup

This guide explains how to set up the Salesforce integration for SmartSendAI.

## Prerequisites

1. A Salesforce account (Production or Sandbox)
2. Admin access to create Connected Apps
3. SmartSendAI application deployed and running

## Step 1: Create a Connected App in Salesforce

1. **Log into Salesforce** as an administrator
2. **Navigate to Setup** → **App Manager** → **New Connected App**
3. **Fill in the basic information:**
   - Connected App Name: `SmartSendAI Integration`
   - API Name: `SmartSendAI_Integration`
   - Contact Email: Your email address
   - Logo: Optional

4. **Enable OAuth Settings:**
   - Check "Enable OAuth Settings"
   - Callback URL: `https://yourdomain.com/api/integrations/salesforce/callback`
   - OAuth Scopes: Select the following:
     - `Access and manage your data (api)`
     - `Perform requests at any time (refresh_token, offline_access)`

5. **Save the Connected App**

6. **Get your credentials:**
   - Note down the **Consumer Key** (Client ID)
   - Note down the **Consumer Secret** (Client Secret)

## Step 2: Environment Variables

Add these environment variables to your `.env.local` file and deployment environment:

```env
# Salesforce Configuration
SALESFORCE_CLIENT_ID=your_consumer_key_here
SALESFORCE_CLIENT_SECRET=your_consumer_secret_here
SALESFORCE_LOGIN_BASE=https://login.salesforce.com

# For sandbox testing, use:
# SALESFORCE_LOGIN_BASE=https://test.salesforce.com

# Site URL (must match your callback URL domain)
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## Step 3: Database Setup

Run the following SQL in your Supabase SQL editor:

```sql
-- Create Salesforce tokens table for OAuth credentials
create table if not exists public.salesforce_tokens (
  team_id uuid primary key,
  instance_url text not null,
  access_token text not null,
  refresh_token text not null,
  org_id text,
  user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for team lookups
create index if not exists idx_sf_tokens_team on public.salesforce_tokens(team_id);

-- Enable RLS
alter table public.salesforce_tokens enable row level security;

-- Create policies
create policy "Team members can view own team's Salesforce tokens"
  on public.salesforce_tokens for select
  using (team_id in (
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy "Team owners can manage own team's Salesforce tokens"
  on public.salesforce_tokens for all
  using (team_id in (
    select id from public.teams where owner_id = auth.uid()
  ));
```

## Step 4: Test the Integration

1. **Deploy your application** with the new environment variables
2. **Navigate to Settings** in your SmartSendAI dashboard
3. **Click "Connect"** on the Salesforce card
4. **Complete the OAuth flow** in Salesforce
5. **Test contact sync** by clicking "Sync Contacts Now"

## Features

### Contact Sync
- Automatically syncs contacts from SmartSendAI to Salesforce
- Updates existing contacts by email
- Creates new contacts for new emails
- Handles up to 300 contacts per sync

### AI Reply Logging
- Logs all AI-generated replies as Tasks in Salesforce
- Links Tasks to the appropriate Contact
- Includes email preview and link back to SmartSendAI
- Automatically refreshes expired access tokens

### Meeting Proposals
- Creates Events in Salesforce when proposing meeting times
- Links Events to the appropriate Contact
- Includes meeting details and SmartSendAI reference

## Troubleshooting

### Common Issues

1. **"SF not connected" error**
   - Ensure the user has completed OAuth
   - Check that the team_id exists in profiles table

2. **"SF refresh failed" error**
   - Verify SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET
   - Check that refresh_token is valid

3. **Callback URL mismatch**
   - Ensure NEXT_PUBLIC_SITE_URL matches your callback URL
   - Check for trailing slashes or protocol mismatches

4. **Permission errors**
   - Verify the Connected App has the correct OAuth scopes
   - Check that the user has API access in Salesforce

### Debug Mode

Enable debug logging by checking the browser console for:
- OAuth flow errors
- API call responses
- Token refresh attempts

## Security Notes

- Access tokens are stored encrypted in the database
- Refresh tokens are used automatically when access tokens expire
- All API calls use HTTPS
- Row-level security ensures users can only access their team's data

## API Version

The integration uses Salesforce API v59.0. If your org enforces a specific version, update the API calls in:
- `src/lib/salesforce-tasks.ts`
- `src/app/api/integrations/salesforce/sync-contacts/route.ts`

## Support

For issues with the Salesforce integration:
1. Check the browser console for error messages
2. Verify environment variables are set correctly
3. Ensure the Connected App is properly configured
4. Check that the user has the necessary Salesforce permissions 