# Email Style Learning Feature

This feature automatically learns from your sent emails and personalizes AI-generated reply suggestions to match your writing style.

## How It Works

1. **Style Extraction**: When you send emails, the system analyzes your writing patterns:
   - Sentence length and structure
   - Greeting style (Hi/Hey/Hello)
   - Signoff preferences (Best/Thanks/Cheers)
   - Formality level (casual/neutral/formal)
   - CTA style (direct vs. soft)
   - Exclamation and emoji usage

2. **Style Application**: When generating reply suggestions, the system applies your learned style to make them sound more like you wrote them.

3. **Continuous Learning**: Your style profile updates with each email you send, becoming more accurate over time.

## Setup

### 1. Database Migration

Run the Supabase migration to create the required tables:

```sql
-- This creates user_styles and sent_samples tables
-- Adds learn_from_sent column to profiles
-- Sets up proper RLS policies
```

### 2. Enable the Feature

1. Go to **Dashboard → Settings**
2. Toggle "Learn from my sent emails" to ON
3. The feature is enabled by default for new users

## Usage

### Sending Emails

Simply send emails as usual through your normal workflow. The system will:
- Log the email content (for audit purposes)
- Extract style features
- Update your personal style profile

### Getting Personalized Suggestions

When you use the objection detection feature:
1. Open a thread with an objection
2. Click "Get Suggestions"
3. The AI will generate replies that match your writing style

### Toggle the Feature

- **ON**: Suggestions are personalized to your style
- **OFF**: Suggestions use default templates

## Technical Details

### Style Features Extracted

- `avg_sentence_len`: Average words per sentence
- `exclam_rate`: Exclamation marks per sentence
- `emoji_rate`: Emojis per sentence
- `greeting`: Preferred greeting style
- `signoff`: Preferred signoff style
- `formality`: Writing formality level
- `cta_style`: Call-to-action phrasing preference

### Style Application

The system applies your style by:
- Adjusting sentence length to match your preference
- Using your preferred greetings and signoffs
- Matching your formality level
- Applying your CTA style

### Data Storage

- **user_styles**: Your aggregated style profile (JSONB)
- **sent_samples**: Last N sent emails for audit (optional)
- **profiles.learn_from_sent**: Feature toggle

## Privacy & Security

- All data is stored in your own database
- Row-level security ensures only you can access your style data
- Email samples are stored locally, not shared with third parties
- You can disable the feature at any time

## Troubleshooting

### Feature Not Working

1. Check that the database migration ran successfully
2. Verify the toggle is enabled in Settings
3. Send a few emails to build your style profile
4. Check browser console for any errors

### Style Not Applied

1. Ensure you've sent enough emails (minimum 2-3 recommended)
2. Check that your emails have varied content
3. Verify the learn_from_sent setting is enabled

### Performance Issues

The style extraction is lightweight and runs locally. If you experience delays:
1. Check database connection
2. Verify RLS policies are working correctly
3. Monitor for any database locks

## Testing

Run the test script to verify the feature works:

```bash
cd scripts
npx tsx test-style-extractor.ts
```

This will test style extraction and merging with sample emails.

## Future Enhancements

- Style confidence scoring
- Industry-specific style templates
- A/B testing different style applications
- Style analytics dashboard
- Export/import style profiles 