# Magic Composer - SmartSend AI

Turn a one-line prompt into a polished **multi-step sequence draft** with variables, tone presets, and **spam-safe rewrites**. Outputs JSON steps you can one-click save into Sequences v1.

## Features

- **AI-Powered Generation**: Uses OpenAI to create sequences from natural language prompts
- **Tone Presets**: Choose from friendly, direct, casual, or professional writing styles
- **Spam-Safe Checks**: Automatically detects and rewrites spammy content
- **Variable Detection**: Identifies and suggests common contact field variables
- **One-Click Save**: Directly creates sequences in your SmartSend account

## Quick Start

1. Navigate to **Dashboard → Magic Composer**
2. Enter your prompt describing the sequence you want
3. Choose a tone (friendly, direct, casual, professional)
4. Click **Generate** to create your sequence draft
5. Review the preview and click **Create sequence** to save

## Example Prompts

- "Short intro to SmartSend for RevOps leaders; ask for a 7-minute call; mention CSV import + sequences"
- "Follow-up sequence for SaaS founders who downloaded our lead magnet; 3 steps, professional tone"
- "Cold outreach to marketing managers about our email automation platform; friendly, 4 steps"

## Tone Presets

### Friendly
- Warm, personal outreach
- British level of politeness
- US brevity
- Natural first-name personalization

### Direct
- Crisp, no-fluff messaging
- Clear value proposition
- Single call-to-action
- One idea per sentence

### Casual
- Conversational tone
- Lowercase okay
- Use contractions
- Keep it human

### Professional
- Formal business tone
- Clear and structured
- Avoid slang
- 3-5 sentences max

## Spam-Safe Features

The system automatically:
- Detects spam trigger words (act now, click here, buy now, etc.)
- Rewrites shouty ALL CAPS text
- Reduces excessive exclamation marks
- Limits email length for better deliverability
- Suggests alternative phrasing

## Variables

Common variables are automatically detected and suggested:
- `{{contact.first_name}}` - Contact's first name
- `{{contact.last_name}}` - Contact's last name
- `{{company.name}}` - Company name
- `{{sender.first_name}}` - Your first name

## API Endpoints

### Generate Sequence
```
POST /api/composer/generate
{
  "prompt": "Your sequence description",
  "tone": "direct"
}
```

### Lint Content (Optional)
```
POST /api/composer/lint
{
  "subject": "Email subject",
  "body": "Email body"
}
```

## Technical Details

- **LLM Model**: Uses OpenAI GPT-4o-mini (configurable via `OPENAI_MODEL`)
- **Validation**: Zod schema validation for all generated content
- **Integration**: Works with existing SmartSend sequences system
- **Timezone**: Respects `DEFAULT_TIMEZONE` environment variable

## Environment Variables

Add to your `.env.local`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
DEFAULT_TIMEZONE=America/Los_Angeles
```

## File Structure

```
src/
├── lib/composer/
│   ├── schema.ts          # Zod validation schemas
│   ├── spamSafe.ts        # Spam detection & rewriting
│   ├── presets.ts         # Tone presets & variable detection
│   └── llm.ts            # OpenAI integration
├── app/api/composer/
│   ├── generate/route.ts  # Main sequence generation
│   └── lint/route.ts      # Content linting (optional)
└── app/dashboard/composer/
    └── page.tsx           # Magic Composer UI
```

## Future Enhancements

- Few-shot examples for niche personas
- Inline AI edit buttons (shorter, friendlier, more technical)
- Organization-level prompt library
- Per-workspace tone defaults
- Spam score badges with live tips
- Auto-include Calendly/ICS for high-reply-intent sequences

## Troubleshooting

### Common Issues

1. **OpenAI API errors**: Check your API key and billing
2. **Validation errors**: Ensure your prompt is clear and specific
3. **Sequence creation fails**: Verify you have permission to create sequences

### Debug Mode

Check the browser console for detailed error messages and API responses.

## Support

For issues or feature requests, please check the SmartSend documentation or contact support. 