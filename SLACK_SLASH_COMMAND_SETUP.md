# Slack Slash Command Setup Guide

This guide will help you set up the `/smartsend` slash command in your Slack workspace to interact with SmartSendAI directly from Slack.

## Prerequisites

- SmartSendAI Slack app already connected (OAuth flow completed)
- `SLACK_SIGNING_SECRET` environment variable configured
- Database tables: `slack_tokens`, `slack_settings`, `ai_reply_events`

## 1. Create Slash Command in Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Select your SmartSendAI Slack app
3. In the left sidebar, click **"Slash Commands"**
4. Click **"Create New Command"**
5. Fill in the details:
   - **Command**: `/smartsend`
   - **Request URL**: `https://yourdomain.com/api/integrations/slack/commands`
   - **Short Description**: `SmartSendAI actions`
   - **Usage Hint**: `roi | leaderboard | insert-meeting [email or @user]`
6. Click **"Save"**

## 2. Environment Variables

Add this to your `.env.local` file:

```env
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
```

**To find your signing secret:**
1. In your Slack app settings, go to **"Basic Information"**
2. Scroll down to **"App Credentials"**
3. Copy the **"Signing Secret"**

## 3. Install App to Workspace

1. In your Slack app settings, go to **"OAuth & Permissions"**
2. Click **"Install to Workspace"**
3. Authorize the app with these scopes:
   - `commands` - For slash commands
   - `chat:write` - To post messages
   - `channels:read` - To list channels
   - `users:read` - To read user info

## 4. Test the Integration

Once configured, users can use these commands in any channel:

### Basic Commands
- `/smartsend help` - Show all available commands
- `/smartsend roi` - Display ROI metrics (replies, meetings, hours saved)
- `/smartsend leaderboard` - Show team leaderboard for the last 7 days
- `/smartsend insert-meeting email@domain.com 30` - Generate meeting scheduling snippet

### Command Examples

**ROI Check:**
```
/smartsend roi
```
Response:
```
ROI
• AI replies: 45
• Meetings: 12
• Hours saved: 3.8h

Upgrade for more: https://yourdomain.com/dashboard/billing
```

**Team Leaderboard:**
```
/smartsend leaderboard
```
Response:
```
Team Leaderboard (7d)
1. john@company.com — 15 replies, 3 meetings
2. sarah@company.com — 12 replies, 2 meetings
3. mike@company.com — 8 replies, 1 meeting

Add seats → https://yourdomain.com/dashboard/team
```

**Meeting Scheduling:**
```
/smartsend insert-meeting prospect@company.com 45
```
Response:
```
Here you go:
How's one of these times?
• Option 1: Jan 15, 2025 at 10:00 AM
• Option 2: Jan 15, 2025 at 2:00 PM
• Option 3: Jan 15, 2025 at 4:00 PM

Or pick any time: https://calendly.com/your-calendar

Add to calendar: data:text/calendar;base64,...
```

## 5. Security Features

The integration includes several security measures:

- **Signature Verification**: All requests are verified using HMAC-SHA256
- **Replay Protection**: Requests older than 5 minutes are rejected
- **Ephemeral Responses**: All responses are private to the user who issued the command
- **Team Isolation**: Commands only work in channels linked to your team

## 6. Troubleshooting

### Command Not Working
1. Verify the slash command is installed in your workspace
2. Check that the Request URL is correct and accessible
3. Ensure your app has the required OAuth scopes

### "Unauthorized" Error
1. Verify `SLACK_SIGNING_SECRET` is set correctly
2. Check that the signing secret matches your app's secret
3. Ensure the request is coming from Slack (check headers)

### No Data Showing
1. Verify the channel is linked to a team in `slack_settings`
2. Check that `ai_reply_events` table has data for your team
3. Ensure the `leaderboard_for_team` RPC function exists

### Database Schema Requirements

Make sure these tables exist:

```sql
-- slack_tokens table
CREATE TABLE IF NOT EXISTS public.slack_tokens (
  team_id uuid primary key,
  access_token text not null,
  bot_user_id text,
  workspace_id text,
  workspace_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- slack_settings table  
CREATE TABLE IF NOT EXISTS public.slack_settings (
  team_id uuid primary key,
  channel_id text,
  post_meeting boolean default true,
  post_low_credits boolean default true,
  post_weekly_digest boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ai_reply_events table (for ROI tracking)
-- This should already exist from your metered billing setup
```

## 7. Advanced Configuration

### Custom Meeting Duration
Users can specify custom meeting durations:
```
/smartsend insert-meeting prospect@company.com 60
```

### User Mentions
Users can mention team members:
```
/smartsend insert-meeting @john
```

### Channel Linking
The slash command automatically detects which team to use based on the channel where it's invoked. Make sure to save the channel selection in your SmartSendAI dashboard.

## 8. Monitoring

Check these logs for debugging:
- API route logs: `/api/integrations/slack/commands`
- Slack API responses in the browser console
- Database queries for team/channel lookups

## 9. Rate Limits

Slack has rate limits for slash commands:
- **Commands per app**: 1000 per minute
- **Response time**: 3 seconds (we handle this with immediate acknowledgment + delayed response)
- **Response URL**: 5 minutes to respond

## 10. Support

If you encounter issues:
1. Check the Slack app's error logs
2. Verify all environment variables are set
3. Test the endpoint manually with a tool like Postman
4. Check that your database has the required data

The integration is designed to be robust and handle errors gracefully, providing helpful error messages to users when something goes wrong. 