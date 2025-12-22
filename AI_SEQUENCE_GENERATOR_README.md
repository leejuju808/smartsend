# AI Sequence Generator

A new feature that generates cold email sequences using OpenAI's GPT models.

## Setup

### 1. Install Dependencies

```bash
npm install openai zod
# or
pnpm add openai zod
```

### 2. Environment Variables

Add to your `.env.local` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

You can swap the model later (e.g., `gpt-4.1-mini`, `o4-mini`). The code reads from `OPENAI_MODEL` with a sane default.

### 3. Files Created

- **API Route**: `src/app/api/ai/generate-sequence/route.ts`
- **UI Component**: `src/components/SequenceGenerator.tsx`
- **Integration**: Added to `src/app/dashboard/page.tsx`

## Usage

1. Navigate to the dashboard
2. Scroll down to the "AI Sequence Generator" section
3. Fill in the required fields:
   - **Product/What it does**: Describe your product or service
   - **Target audience**: Who you're emailing (role/industry)
   - **Company**: Your company name (optional)
   - **Tone**: Choose from Professional, Casual, or Bold
   - **CTA**: Call-to-action text
   - **Total emails**: Number of emails in the sequence (3-5)
4. Click "Generate Sequence"
5. Review the generated subject line and email sequence
6. Use "Insert into Composer" to integrate with your campaign composer

## Features

- Generates subject lines under 55 characters
- Creates email bodies of 120-170 words
- Uses short paragraphs and 1-2 bullet points max
- Avoids spammy words and ALL CAPS
- Personalizes content to the target audience
- Supports 3-5 email sequences with proper timing
- Follow-up emails are scheduled at day 2, 5, and 9

## API Response Format

```json
{
  "ok": true,
  "data": {
    "subject": "Quick question about [topic]",
    "messages": [
      {
        "label": "initial",
        "dayOffset": 0,
        "body": "Hi [Name],\n\nI noticed you're..."
      },
      {
        "label": "followup-1",
        "dayOffset": 2,
        "body": "Hi [Name],\n\nFollowing up on my..."
      }
    ]
  }
}
```

## Error Handling

The API includes comprehensive error handling for:
- Missing OpenAI API key
- Invalid input validation
- OpenAI API failures
- JSON parsing errors
- Response format validation

All errors are returned with appropriate HTTP status codes and user-friendly messages.