# SmartSend Magic Composer

## Overview
The Magic Composer is a powerful AI-powered tool that turns simple prompts into polished multi-step email sequences with tone presets and spam-safe checks.

## Features
- **AI-Powered Generation**: Convert one-line prompts into complete email sequences
- **Tone Presets**: Choose from Friendly, Direct, Casual, or Professional tones
- **Spam-Safe Rewrites**: Automatic detection and rewriting of spammy content
- **Variable Detection**: Automatic detection of template variables like `{{contact.first_name}}`
- **Multi-Step Sequences**: Generate 3-5 step sequences with proper timing
- **One-Click Save**: Save generated sequences directly to your SmartSend account

## How It Works

### 1. Prompt Input
Enter a simple description of what you want your sequence to accomplish:
```
"Short intro to SmartSend for RevOps leaders; ask for a 7-minute call; mention CSV import + sequences."
```

### 2. Tone Selection
Choose from four tone presets:
- **Friendly**: Warm, personalized outreach with British politeness
- **Direct**: Crisp, no-fluff messaging with clear value propositions
- **Casual**: Conversational, human-like communication
- **Professional**: Formal business tone, 3-5 sentences

### 3. AI Generation
The system uses OpenAI to:
- Generate appropriate subject lines (≤55 characters)
- Create email bodies (60-120 words)
- Set proper timing between steps (2-5 days)
- Insert natural variable placeholders
- Apply spam-safe language

### 4. Spam-Safe Processing
Automatic checks and rewrites:
- Removes spammy phrases like "ACT NOW", "CLICK HERE"
- Reduces excessive exclamation marks
- Softens shouty ALL CAPS text
- Limits sentence length for readability
- Scores content for deliverability

### 5. Sequence Creation
One-click save creates:
- Sequence record with proper settings
- All steps with templates and timing
- Ready for immediate use

## API Endpoints

### `/api/composer/generate`
Generates a sequence from a prompt and tone.

**Request:**
```json
{
  "prompt": "Your sequence description",
  "tone": "direct"
}
```

**Response:**
```json
{
  "ok": true,
  "draft": {
    "name": "Sequence Name",
    "timezone": "America/Los_Angeles",
    "stop_on_reply": true,
    "send_window": {
      "days": [1,2,3,4,5],
      "start_hour": 9,
      "end_hour": 17
    },
    "throttle_per_tick": 40,
    "steps": [...]
  }
}
```

### `/api/composer/lint` (Optional)
Analyzes existing content for spam scores and suggestions.

### `/api/sequences/save`
Saves the generated sequence to the database.

## File Structure

```
src/
├── lib/composer/
│   ├── schema.ts          # Zod schemas for validation
│   ├── spamSafe.ts        # Spam detection and rewriting
│   ├── presets.ts         # Tone presets and variable detection
│   └── llm.ts            # OpenAI integration
├── app/api/composer/
│   ├── generate/route.ts  # Sequence generation endpoint
│   └── lint/route.ts      # Content analysis endpoint
└── app/dashboard/composer/
    └── page.tsx           # Magic Composer UI
```

## Usage Examples

### Basic Outreach Sequence
**Prompt:** "Follow up with prospects who downloaded our whitepaper"
**Tone:** Professional
**Result:** 3-step sequence with educational content and clear CTAs

### Sales Sequence
**Prompt:** "Introduce our new product to existing customers"
**Tone:** Friendly
**Result:** 4-step sequence with personalization and upgrade offers

### Event Promotion
**Prompt:** "Promote our upcoming webinar about email deliverability"
**Tone:** Direct
**Result:** 3-step sequence with urgency and registration links

## Configuration

### Environment Variables
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
DEFAULT_TIMEZONE=America/Los_Angeles
```

### Dependencies
- `openai`: AI model integration
- `zod`: Schema validation
- Built-in spam detection algorithms

## Future Enhancements

- **Few-shot Examples**: Industry-specific prompt templates
- **Inline Editing**: AI-powered content refinement
- **Prompt Library**: Organization-level prompt management
- **Spam Score Badges**: Real-time deliverability feedback
- **Auto-include Features**: Automatic Calendly/ICS integration

## Troubleshooting

### Common Issues

1. **"No active workspace selected"**
   - Ensure you have an active workspace selected in the dashboard
   - Check localStorage for 'active_workspace' key

2. **"compose failed"**
   - Verify OpenAI API key is set
   - Check API rate limits
   - Ensure prompt is clear and specific

3. **Sequence not saving**
   - Verify database permissions
   - Check sequence_steps table exists
   - Ensure workspace_id is valid

### Performance Tips

- Keep prompts under 200 characters for faster generation
- Use specific tone selections for more consistent results
- Test with small audiences before scaling

## Security & Compliance

- All content is processed through spam-safe filters
- No sensitive data is stored in AI prompts
- Rate limiting prevents abuse
- RLS ensures workspace isolation

---

**Impact:** Turn intent into send-ready sequences in seconds — consistently on-brand, variable-aware, and deliverability-safe. This is a revenue accelerator on day one. 🚀 