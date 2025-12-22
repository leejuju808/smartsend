# Smart Meeting Insert + .ICS Generator

A tiny NLP trigger that adds your Calendly link and attaches a calendar invite whenever a reply mentions a call/meeting. It directly lifts conversions from warm replies → booked calls → revenue.

## 🚀 Features

- **Smart Intent Detection**: Lightweight NLP that detects meeting intent in reply text
- **One-Click Insertion**: "Insert meeting + .ics" button appears automatically
- **Calendar Invite Generation**: Creates downloadable .ics files for calendar apps
- **Inline Integration**: Seamlessly integrates with your existing reply composer
- **Error Handling**: Graceful fallbacks and user-friendly error messages

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Reply Text    │───▶│  Intent Detector │───▶│ Smart Meeting   │
│                 │    │                  │    │ Insert Button   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   ICS Generator  │    │  Reply Composer │
                       │   (/api/ics)     │    │                 │
                       └──────────────────┘    └─────────────────┘
```

## 📁 File Structure

```
src/
├── lib/meetings/
│   ├── ics.ts              # ICS calendar file generator
│   └── intent.ts           # Meeting intent detection
├── app/api/ics/
│   └── route.ts            # ICS generation API endpoint
├── components/reply/
│   └── SmartMeetingInsert.tsx  # Main component
└── app/playground/smart-meeting-demo/
    └── page.tsx            # Demo page
```

## 🔧 Setup

### 1. Environment Variables

Add to your `.env.local`:

```bash
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/YOUR_HANDLE/intro-call
MEETING_DEFAULT_TITLE=SmartSend intro call
MEETING_DEFAULT_DURATION_MIN=30
NEXT_PUBLIC_SITE_NAME=SmartSend
```

### 2. Integration

Wire the component into your reply composer:

```tsx
import SmartMeetingInsert from '@/components/reply/SmartMeetingInsert';

// Inside your composer container
<SmartMeetingInsert
  composerText={replyText}                 // your state string
  organizerEmail={session?.user?.email!}   // or a team-wide email
  onInsert={({ text, icsUrl }) => {
    setReplyText(prev => (prev ? prev + "\n\n" : "") + text);
    if (icsUrl) {
      // if your composer supports attachments, add here
      addAttachment({ name: "meeting.ics", url: icsUrl, mime: "text/calendar" });
    }
  }}
/>
```

## 🎯 How It Works

### 1. Intent Detection

The `detectMeetingIntent()` function analyzes reply text using:

**Keywords:**
- call, quick call, hop on, jump on, zoom, google meet, teams
- meeting, chat live, schedule, book time, calendar, phone
- availability, time to connect, let's talk, phone call

**Time Hints:**
- today, tomorrow, this week, next week
- morning, afternoon, pst, est, cst, mst

**Logic:**
- Must have at least one keyword
- Time hints increase confidence
- Lightweight regex-based detection (no heavy NLP)

### 2. Smart Insertion

When meeting intent is detected:

1. **Button Appears**: "Insert meeting + .ics" button shows inline
2. **ICS Generation**: Calls `/api/ics` to create calendar invite
3. **Text Insertion**: Adds meeting text to reply composer
4. **File Attachment**: Provides .ics file for download/attachment

### 3. ICS Generation

The `/api/ics` endpoint:

- Accepts meeting details (title, start time, duration, organizer)
- Generates RFC 5545 compliant .ics files
- Returns downloadable calendar invite
- Handles timezone conversion and validation

## 🧪 Testing

### Manual Testing

1. Navigate to `/playground/smart-meeting-demo`
2. Type meeting-related phrases in the composer
3. Verify the "Insert meeting + .ics" button appears
4. Click the button and check generated content

### Test Cases

```typescript
// Should trigger meeting intent
"Can we hop on a quick call tomorrow?"
"Share your Zoom?"
"Let's schedule a meeting this week"

// Should NOT trigger
"Thanks, send pricing."
"Great product, I'll review it."
```

### Unit Tests

Run the intent detector tests:

```bash
npm test src/lib/meetings/intent.test.ts
```

## 🔌 API Reference

### POST /api/ics

**Request Body:**
```typescript
{
  title?: string;           // Meeting title (defaults to env var)
  description?: string;      // Meeting description
  startISO: string;         // Start time in ISO format
  durationMin?: number;     // Duration in minutes (default: 30)
  organizerEmail: string;   // Required: organizer email
  organizerName?: string;   // Organizer name (default: env var)
  location?: string;        // Meeting location (default: Calendly URL)
}
```

**Response:**
- **Success**: ICS file with `Content-Type: text/calendar`
- **Error**: JSON error message with appropriate HTTP status

### SmartMeetingInsert Component

**Props:**
```typescript
type Props = {
  composerText: string;     // Current reply text
  onInsert: (insertion: {   // Callback for insertion
    text: string;           // Text to insert
    icsUrl?: string;        // ICS file URL (if generated)
  }) => void;
  organizerEmail: string;   // Email for calendar invite
};
```

## 🎨 Customization

### Styling

The component uses Tailwind CSS classes. Customize by modifying:

```tsx
className="rounded-2xl px-3 py-1 text-sm bg-black text-white hover:opacity-90 disabled:opacity-50"
```

### Meeting Text

Customize the inserted text in `SmartMeetingInsert.tsx`:

```tsx
const insertionText = [
  "Great—happy to connect! ",
  calendly ? `Here's my booking link: ${calendly}. ` : "",
  "I've also attached a calendar invite for a tentative slot tomorrow at 10:00.",
].join("");
```

### Intent Detection

Modify keywords in `src/lib/meetings/intent.ts`:

```typescript
const KEYWORDS = [
  "call", "quick call", "hop on", "jump on", "zoom",
  // Add your custom keywords here
];
```

## 🚨 Error Handling

The component includes comprehensive error handling:

- **API Failures**: Graceful fallback to basic meeting text
- **Missing Data**: Validation of required fields
- **Network Issues**: Timeout handling and user feedback
- **File Generation**: Fallback when ICS creation fails

## 📈 Performance

- **Lightweight**: No heavy NLP libraries
- **Fast**: Regex-based detection (< 1ms)
- **Efficient**: Minimal re-renders with React hooks
- **Scalable**: Stateless API endpoint

## 🔮 Future Enhancements

- **AI-Powered Detection**: Integrate with OpenAI for better intent recognition
- **Calendar Integration**: Direct calendar API integration
- **Meeting Templates**: Pre-defined meeting types and durations
- **Analytics**: Track meeting conversion rates
- **Multi-language**: Support for international meeting phrases

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This feature is part of SmartSend AI and follows the same licensing terms.

---

**Built with ❤️ by the SmartSend team** 