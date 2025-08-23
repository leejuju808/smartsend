# HubSpot Integration Setup

This document outlines how to set up and use the HubSpot integration for SmartSendAI.

## Overview

The HubSpot integration allows teams to:
- Sync contacts between SmartSendAI and HubSpot
- Log AI replies as activities/notes in HubSpot
- Maintain CRM data consistency automatically

## Setup Steps

### 1. Create HubSpot Private App

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new private app
3. Configure the following scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.objects.deals.read`
   - `crm.objects.tasks.write`
   - `crm.schemas.custom.read`
   - `crm.objects.activities.write`
   - `oauth`
4. Set redirect URI: `https://yourdomain.com/api/integrations/hubspot/callback`
5. Save the app and note down:
   - Client ID
   - Client Secret

### 2. Environment Variables

Add these to your `.env.local` file:

```bash
HUBSPOT_CLIENT_ID=your_client_id_here
HUBSPOT_CLIENT_SECRET=your_client_secret_here
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

### 3. Database Migration

Run the Supabase migration to create the required table:

```sql
-- This is automatically applied via the migration file
-- supabase/migrations/20250130_add_hubspot_tokens.sql
```

### 4. Deploy and Test

1. Deploy your application
2. Go to Settings → HubSpot Integration
3. Click "Connect" to start OAuth flow
4. Complete the HubSpot authorization
5. Test contact sync functionality

## Features

### Contact Sync
- One-way sync from SmartSendAI to HubSpot
- Upserts contacts by email address
- Syncs: email, first name, last name, company
- Manual sync via Settings page
- Automatic nightly sync via GitHub Actions

### Activity Logging
- AI replies are logged as HubSpot notes
- Notes include subject, preview, and link back to SmartSendAI
- Associated with the correct contact automatically

### Token Management
- Automatic OAuth token refresh
- Secure storage in Supabase with RLS
- Per-team token isolation

## API Endpoints

### OAuth Flow
- `GET /api/integrations/hubspot/start` - Start OAuth
- `GET /api/integrations/hubspot/callback` - OAuth callback

### Sync Operations
- `POST /api/integrations/hubspot/sync-contacts` - Manual contact sync

## Nightly Sync

The integration includes an automated nightly sync script that:
- Runs daily at 2 AM UTC via GitHub Actions
- Syncs new contacts from the past 24 hours
- Logs any AI reply activities
- Handles errors gracefully

## Troubleshooting

### Common Issues

1. **OAuth Error**: Check client ID/secret and redirect URI
2. **Sync Failures**: Verify HubSpot API quotas and permissions
3. **Token Expiry**: Tokens auto-refresh, but check refresh token validity

### Debug Steps

1. Check browser console for OAuth errors
2. Verify environment variables are set correctly
3. Check Supabase logs for database errors
4. Monitor GitHub Actions for sync job failures

## Security Considerations

- OAuth tokens are stored securely in Supabase
- Row-level security ensures team isolation
- No sensitive data is logged or exposed
- API calls use proper authentication headers

## Future Enhancements

- Two-way contact sync
- Deal and task creation
- Custom property mapping
- Webhook support for real-time updates
- Bulk import/export tools 