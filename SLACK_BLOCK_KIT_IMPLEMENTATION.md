# Slack Block Kit Implementation

This document describes the implementation of Slack Block Kit messaging with interactive buttons for SmartSendAI.

## Overview

The system provides rich Slack messages with interactive buttons that can:
- Open URLs directly (no server processing needed)
- Trigger server-side actions via the interactivity endpoint
- Provide better UX than plain text messages

## Components

### 1. Core Functions (`src/lib/slack.ts`)

- `postSlackBlocks(teamId, channel, blocks, textFallback)` - Posts Block Kit messages
- `postSlack(teamId, channel, text)` - Posts plain text (existing)

### 2. Block Templates (`src/lib/slackBlocks.ts`)

#### Low Credits Warning
```typescript
import { lowCreditsBlocks } from "@/lib/slackBlocks";
await postSlackBlocks(prof.team_id, s.channel_id, lowCreditsBlocks(updatedBalance));
```

#### Meeting Booked
```typescript
import { meetingBookedBlocks } from "@/lib/slackBlocks";
await postSlackBlocks(prof.team_id, s.channel_id, meetingBookedBlocks(subject));
```

#### Weekly Leaderboard
```typescript
import { leaderboardBlocks } from "@/lib/slackBlocks";
await postSlackBlocks(r.team_id, set.channel_id, leaderboardBlocks(lines));
```

#### Promotional Offers
```typescript
import { promoBlocks } from "@/lib/slackBlocks";
await postSlackBlocks(teamId, channel, promoBlocks(20, 30, "PROMO123"));
```

#### Meeting Insertion
```typescript
import { insertMeetingBlocks } from "@/lib/slackBlocks";
await replyWithBlocks(response_url, insertMeetingBlocks());
```

### 3. Interactivity Endpoint (`src/app/api/integrations/slack/interact/route.ts`)

Handles button clicks and other interactive actions:

- **URL buttons**: Open links directly (no server processing)
- **Action buttons**: Trigger server-side logic (e.g., generate meeting snippets)

### 4. Deeplink Support (`src/app/api/billing/topup/deeplink/route.ts`)

Redirects users to billing page with preselected top-up options.

## Usage Examples

### Low Credits Notification
When team credits drop below 50:

```typescript
import { postSlackBlocks } from "@/lib/slack";
import { lowCreditsBlocks } from "@/lib/slackBlocks";

// Replace existing plain text post
// await postSlack(prof.team_id, s.channel_id, `⚠️ Credits low (${updatedBalance} left)...`);

// With rich block message
await postSlackBlocks(prof.team_id, s.channel_id, lowCreditsBlocks(updatedBalance));
```

### Weekly Digest
Already updated to use blocks automatically.

### Slash Commands
The `/smartsend insert-meeting` command now shows interactive buttons instead of plain text.

## Button Types

### URL Buttons (No Server Processing)
```typescript
{
  type: "button",
  text: { type: "plain_text", text: "Buy 200 now" },
  url: "https://app.com/billing?topup=200",
  style: "primary"
}
```

### Action Buttons (Server Processing)
```typescript
{
  type: "button",
  text: { type: "plain_text", text: "Insert 30-min Snippet" },
  action_id: "insert_meeting_snippet",
  value: "30"
}
```

## Configuration

### Slack App Settings
1. **Interactivity & Shortcuts**: Set Request URL to `https://yourdomain.com/api/integrations/slack/interact`
2. **Slash Commands**: Already configured
3. **OAuth Scopes**: Ensure `chat:write` and `commands` are enabled

### Environment Variables
- `NEXT_PUBLIC_SITE_URL`: Your app's base URL
- `NEXT_PUBLIC_CALENDLY_URL`: Calendly URL for meeting scheduling
- `SLACK_SIGNING_SECRET`: For verifying Slack requests

## Security

- All requests are verified using `verifySlack()` function
- Replay protection (5-minute window)
- HMAC signature validation

## Benefits

1. **Better UX**: Rich formatting, clear CTAs
2. **Higher Conversion**: Prominent upgrade buttons
3. **Reduced Friction**: Direct links to billing/upgrade pages
4. **Interactive Elements**: Server-generated content on demand
5. **Consistent Design**: Standardized message templates

## Migration Guide

### Existing Plain Text Posts
Replace:
```typescript
await postSlack(teamId, channel, "Your message here");
```

With:
```typescript
import { appropriateBlockFunction } from "@/lib/slackBlocks";
await postSlackBlocks(teamId, channel, appropriateBlockFunction(params));
```

### New Notifications
Use the appropriate block template function based on the notification type:
- Credit warnings → `lowCreditsBlocks()`
- Meeting confirmations → `meetingBookedBlocks()`
- Weekly summaries → `leaderboardBlocks()`
- Promotional offers → `promoBlocks()`
- Meeting insertion → `insertMeetingBlocks()`

## Testing

1. **Local Development**: Use ngrok for Slack webhook testing
2. **Button Actions**: Test interactivity endpoint with Postman/curl
3. **URL Buttons**: Verify links work correctly
4. **Fallback Text**: Ensure notifications work in all Slack clients 