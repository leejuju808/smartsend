# Objection Detection System

The Objection Detection System automatically identifies common sales objections in customer messages and provides AI-powered response suggestions to help sales teams respond more effectively.

## Features

- **Automatic Detection**: Identifies 6 common objection types using regex patterns
- **Tone Selection**: Choose from Direct, Friendly, or Consultative response styles
- **Smart Templates**: Pre-written responses with merge variable support
- **Easy Integration**: Simple React component that can be dropped into any reply composer

## Objection Types

1. **Price** - Budget concerns, cost objections
2. **Not Interested** - General disinterest, pass responses
3. **Send More Info** - Requests for additional materials
4. **Bad Timing** - Busy periods, scheduling conflicts
5. **Already Using** - Existing solutions, competitor tools
6. **Who Are You** - Identity questions, company inquiries

## Response Tones

- **Direct**: Straightforward, no-nonsense approach
- **Friendly**: Warm, conversational style
- **Consultative**: Professional, advisory tone

## Usage

### Basic Integration

```tsx
import ObjectionAssistant from '@/components/ObjectionAssistant';

function ReplyComposer({ thread }) {
  const [draftText, setDraftText] = useState('');
  
  const lastMessage = thread?.lastInboundMessage ?? "";
  const vars = {
    first_name: thread?.contact?.first_name,
    company: thread?.contact?.company,
    my_name: "Your Name",
    calendly: process.env.NEXT_PUBLIC_CALENDLY_URL,
  };

  function insert(text: string) {
    setDraftText(prev => (prev ? prev + "\n\n" + text : text));
  }

  return (
    <div className="space-y-3">
      <ObjectionAssistant 
        lastMessage={lastMessage} 
        vars={vars} 
        onInsert={insert} 
      />
      {/* Your existing editor + send button */}
    </div>
  );
}
```

### API Endpoint

The system includes a REST API endpoint at `/api/replies/assist`:

```typescript
POST /api/replies/assist
{
  "lastMessage": "This is too expensive",
  "tone": "consultative",
  "vars": {
    "first_name": "John",
    "company": "Acme Corp",
    "my_name": "Sales Team",
    "calendly": "https://calendly.com/yourname/intro"
  }
}
```

Response:
```json
{
  "suggestions": [
    {
      "type": "price",
      "tone": "consultative",
      "text": "Thanks for the candor, John. Budget makes sense..."
    }
  ]
}
```

## Merge Variables

Templates support the following merge variables:

- `{{first_name}}` - Contact's first name
- `{{company}}` - Company name
- `{{my_name}}` - Your name/team name
- `{{calendly}}` - Calendly booking link

## Configuration

Set the following environment variable:

```env
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/yourname/intro-30
```

## Testing

Run the test suite:

```bash
npm test tests/objection-detector.test.ts
```

Or visit the demo page at `/playground/objection-demo` to test interactively.

## Customization

### Adding New Objection Types

1. Add the objection type to the `Objection` type in `src/lib/objection-detector.ts`
2. Add regex patterns to the `RULES` object
3. Add response templates to `src/lib/playbooks.ts`

### Modifying Response Templates

Edit the `BASE` object in `src/lib/playbooks.ts` to customize response content and tone.

## Architecture

- **Objection Detector** (`src/lib/objection-detector.ts`) - Core detection logic
- **Playbooks** (`src/lib/playbooks.ts`) - Response templates and merge variable handling
- **API Route** (`src/app/api/replies/assist/route.ts`) - REST endpoint for suggestions
- **React Component** (`src/components/ObjectionAssistant.tsx`) - UI component
- **Integration** - Drop into existing reply composers

## Benefits

- **Faster Response Times**: Pre-written templates reduce reply composition time
- **Consistent Messaging**: Standardized responses across the sales team
- **Higher Conversion**: Professionally crafted responses to common objections
- **Easy Scaling**: Works with any volume of customer messages 