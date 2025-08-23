# Slack Integration Setup Guide

## Prerequisites
- SmartSendAI application deployed and running
- Supabase database with the required tables
- GitHub repository for automated weekly digests

## 1. Create Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Enter app name (e.g., "SmartSendAI") and select your workspace
4. Go to "OAuth & Permissions" in the left sidebar
5. Add the following OAuth scopes:
   - `chat:write` - Post messages to channels
   - `channels:read` - List available channels
   - `groups:read` - Read private channels
   - `users:read` - Read user information
6. Set redirect URL to: `https://yourdomain.com/api/integrations/slack/callback`
7. Copy the **Client ID** and **Client Secret**

## 2. Environment Variables

Add these to your `.env.local` file:

```bash
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

## 3. Database Setup

Run this SQL in your Supabase SQL editor:

```sql
-- Create Slack integration tables
create table if not exists public.slack_tokens (
  team_id uuid primary key,          -- your app team_id
  access_token text not null,        -- xoxb-...
  bot_user_id text,
  workspace_id text,                 -- Slack team id (T123…)
  workspace_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.slack_settings (
  team_id uuid primary key,
  channel_id text,                   -- where to post
  post_meeting boolean default true,
  post_low_credits boolean default true,
  post_weekly_digest boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add RLS policies if needed
alter table public.slack_tokens enable row level security;
alter table public.slack_settings enable row level security;
```

## 4. GitHub Actions Setup (Optional)

For automated weekly digests:

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `SITE_URL`: Your site URL (e.g., `https://yourdomain.com`)
   - `CRON_TOKEN`: A secure token for cron job authentication

## 5. Integration Points

### Meeting Booked Notifications
When marking `meeting_booked=true` in your send flow, add this code:

```typescript
// after setting meeting_booked=true for the event
try {
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return;
  
  const { data: s } = await supabaseAdmin.from("slack_settings").select("channel_id, post_meeting").eq("team_id", prof.team_id).maybeSingle();
  if (s?.post_meeting && s.channel_id) {
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/slack/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: prof.team_id,
        channel_id: s.channel_id,
        text: `🎉 *Meeting booked!* via SmartSendAI\nSubject: ${subject}\nOwner: <${process.env.NEXT_PUBLIC_SITE_URL}/dashboard|View in app>`
      })
    });
  }
} catch {}
```

### Low Credit Notifications
When team credits drop below 50, add this code:

```typescript
if (updatedBalance <= 50) {
  const { data: s } = await supabaseAdmin.from("slack_settings").select("channel_id, post_low_credits").eq("team_id", prof.team_id).maybeSingle();
  if (s?.post_low_credits && s.channel_id) {
    await postSlack(prof.team_id, s.channel_id,
      `⚠️ Credits low (${updatedBalance} left). <${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/billing?topup=1|Buy 200 now> to keep replies flowing.`);
  }
}
```

## 6. Testing

1. Deploy your application
2. Go to Settings page and click "Connect" on the Slack card
3. Authorize the Slack app
4. Select a channel and save
5. Test by booking a meeting or running the weekly digest manually

## 7. Weekly Digest

The weekly digest runs automatically every Friday at 16:00 UTC via GitHub Actions, or you can trigger it manually by calling:

```bash
curl -X POST https://yourdomain.com/api/integrations/slack/weekly-digest \
  -H "Authorization: Bearer your_cron_token"
```

## Troubleshooting

- **OAuth errors**: Check redirect URL matches exactly
- **Permission errors**: Verify OAuth scopes are correct
- **Channel not found**: Ensure bot is added to the selected channel
- **Weekly digest fails**: Check GitHub Actions secrets and cron token 