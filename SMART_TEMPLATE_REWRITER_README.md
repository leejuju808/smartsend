# Smart Template Rewriter — Variable-Aware A/B Generator

A powerful AI-powered tool that rewrites email templates while preserving handlebars variables, avoiding spammy phrasing, and generating multiple A/B variants for testing.

## Features

- **Variable Preservation**: Automatically masks and preserves handlebars-style variables like `{{first_name}}`, `{{company}}`, `{{lead.custom.industry}}`
- **Spam Detection**: Built-in spam scoring to help avoid deliverability issues
- **Multiple Variants**: Generate 1-5 A/B variants with different tones and styles
- **Tone Control**: Choose from professional, friendly, concise, casual, or neutral tones
- **Word Limit**: Soft word count limits to keep emails concise
- **One-Click Insert**: Easy integration with campaign editing interface

## Files Created

### Core Library
- `lib/ai/rewriteTemplate.ts` - Main rewrite logic with OpenAI integration
- `src/app/api/ai/rewrite/route.ts` - API endpoint for template rewriting

### UI Components
- `src/app/campaigns/[id]/SmartRewritePanel.tsx` - React component for the rewrite interface
- `src/app/campaigns/[id]/edit/page.tsx` - Campaign edit page with integrated rewrite panel

### Testing
- `test-rewrite.ts` - Test script to verify functionality

## Usage

### API Endpoint
```typescript
POST /api/ai/rewrite
{
  "subject": "Hi {{first_name}}, interested in {{company}}?",
  "body": "<p>Hi {{first_name}},</p><p>I noticed {{company}} might benefit from our solution...</p>",
  "tone": "professional",
  "max_words": 120,
  "variants": 3,
  "context": "SmartSend cold email to SMB decision-makers"
}
```

### React Component
```tsx
import SmartRewritePanel from "./SmartRewritePanel";

<SmartRewritePanel
  initialSubject={campaign.subject_template}
  initialBody={campaign.body_template}
  onPick={(updates) => {
    // Handle template updates
    updateCampaign(updates);
  }}
/>
```

## How It Works

1. **Variable Masking**: The system identifies handlebars variables (`{{variable}}`) and replaces them with temporary placeholders (`[[VAR_0]]`, `[[VAR_1]]`, etc.) before sending to OpenAI
2. **AI Rewriting**: OpenAI GPT-4o-mini rewrites the content while preserving the masked variables
3. **Variable Restoration**: Variables are restored to their original form in the output
4. **Spam Scoring**: Each variant is scored for potential spam indicators
5. **Variant Generation**: Multiple variants are generated with different approaches

## Spam Detection

The built-in spam detector flags:
- Common spam phrases: "free money", "act now", "guarantee", "winner", etc.
- Excessive punctuation: Multiple exclamation marks
- All-caps text: Long strings of capital letters

Scores:
- 0: Clean
- 1-4: Moderate risk
- 5+: High spam risk

## Environment Setup

Ensure your `.env` file contains:
```
OPENAI_API_KEY=sk-...
```

## Testing

Run the test script to verify functionality:
```bash
npx tsx test-rewrite.ts
```

## Integration Notes

- The component integrates seamlessly with existing campaign editing workflows
- Templates are updated via PATCH requests to `/api/campaigns/{id}`
- The interface shows spam scores with color-coded warnings
- Variables are preserved exactly as they appear in the original template

## Future Enhancements

- Custom spam detection rules
- Industry-specific tone suggestions
- Performance analytics for different variants
- Bulk template rewriting
- Integration with A/B testing framework