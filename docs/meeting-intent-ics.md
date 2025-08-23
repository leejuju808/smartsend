# Meeting Intent Detection & ICS Calendar Integration

This feature automatically detects when someone wants to schedule a meeting and automatically generates a calendar invite (.ics file) to attach to your reply.

## How It Works

1. **Meeting Intent Detection**: Uses a two-signal heuristic to detect meeting intent:
   - **Intent words**: call, meet, meeting, zoom, teams, schedule, chat, talk, phone
   - **Time context**: this, next, tomorrow, today, week, soon, time, available, availability, morning, afternoon

2. **Automatic Enhancement**: When meeting intent is detected, the system:
   - Adds a Calendly link to your reply
   - Generates a 30-minute calendar invite (.ics file)
   - Attaches the calendar file to the email
   - Adds a note about the attached calendar invite

## Setup

### Environment Variables

Add these to your `.env.local` file:

```bash
# Meeting Intent & ICS Calendar Configuration
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/yourname/intro-30
NEXT_PUBLIC_SUPPORT_EMAIL=hello@yourdomain.com
RESEND_API_KEY=YOUR_RESEND_KEY
RESEND_FROM=SmartSendAI <hello@yourdomain.com>
```

### API Endpoint

The system uses `/api/replies/send` which:
- Accepts `to`, `subject`, and `body` parameters
- Automatically detects meeting intent
- Generates ICS file if needed
- Sends via Resend with attachments

## Usage

### In the UI

The inbox reply composer automatically uses this functionality. Just type a normal reply - the system detects meeting intent server-side.

### Programmatically

```typescript
import { wantsMeeting } from '@/lib/meeting-intent';
import { buildSimpleICS } from '@/lib/ics';

// Check if text contains meeting intent
const hasIntent = wantsMeeting('Can we set up a call next week?'); // true

// Generate ICS file
const ics = buildSimpleICS({
  title: 'Intro Call – SmartSendAI',
  description: 'Looking forward to chatting!',
  url: 'https://calendly.com/yourname/intro-30',
  start: new Date(Date.now() + 48 * 3600 * 1000), // 2 days out
  end: new Date(Date.now() + 48 * 3600 * 1000 + 30 * 60 * 1000), // 30 mins
  organizer: 'mailto:hello@yourdomain.com',
});
```

## Testing

### Local Testing

1. Start the dev server: `npm run dev`
2. Open a thread where the customer message says something like "Can we set up a call next week?"
3. Type a normal reply (no calendar language needed)
4. Click Send
5. Check that the email includes:
   - Calendly link
   - .ics attachment
   - Note about the calendar invite

### Demo Script

Run the demo script to see the functionality in action:

```bash
tsx scripts/demo-meeting-intent.ts
```

## Examples

### Text that triggers meeting intent:
- "Can we set up a call next week?"
- "I would like to meet tomorrow"
- "Let's schedule a zoom call this afternoon"
- "We should have a meeting soon"

### Text that doesn't trigger:
- "Hello, how are you?"
- "Thanks for the information"
- "I want to call you" (no time context)
- "I'm available next week" (no meeting intent)

## Customization

### Meeting Duration
Currently set to 30 minutes. Modify in `/api/replies/send/route.ts`:

```typescript
const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 mins
```

### Meeting Timing
Currently set to 2 days out. Modify in `/api/replies/send/route.ts`:

```typescript
const start = new Date(Date.now() + 48 * 3600 * 1000); // 2 days out
```

### Calendar Title/Description
Modify the ICS generation in `/api/replies/send/route.ts`:

```typescript
const ics = buildSimpleICS({
  title: "Intro Call – SmartSendAI", // Customize this
  description: "Looking forward to chatting!", // Customize this
  // ... other options
});
```

## Security Notes

- Meeting intent detection happens server-side
- Environment variables are kept server-side
- ICS generation is secure and doesn't expose sensitive data
- All email sending goes through Resend with proper authentication 