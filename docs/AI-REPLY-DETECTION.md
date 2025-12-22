# AI Reply Detection System

This Supabase Edge Function provides AI-powered email reply detection for cold email campaigns.

## Overview

The AI Reply Detection system automatically classifies incoming email replies to determine if they represent genuine interest or engagement from prospects. This helps sales teams prioritize follow-ups and track campaign effectiveness.

## Features

- **AI-Powered Classification**: Uses OpenAI's GPT-4o-mini to analyze email content
- **Automatic Lead Status Updates**: Updates lead status to "Replied" when genuine interest is detected
- **Analytics Tracking**: Logs all detection results for performance analysis
- **Robust Error Handling**: Comprehensive error handling and validation
- **Database Integration**: Seamless integration with existing lead management system

## API Endpoint

**POST** `/ai-reply-detection`

### Request Body

```json
{
  "lead_id": "uuid",
  "email_body": "string"
}
```

### Response

```json
{
  "success": true,
  "isReplied": boolean,
  "classification": "YES" | "NO",
  "lead_id": "uuid"
}
```

## Database Schema

### Tables Used

1. **leads** - Main leads table
   - `id` (UUID) - Primary key
   - `status` (TEXT) - Lead status
   - `replied_at` (TIMESTAMPTZ) - When reply was detected
   - `last_updated` (TIMESTAMPTZ) - Last update timestamp

2. **reply_detections** - Analytics table
   - `id` (UUID) - Primary key
   - `lead_id` (UUID) - Reference to leads table
   - `email_body` (TEXT) - Truncated email content
   - `ai_classification` (TEXT) - AI classification result
   - `detected_at` (TIMESTAMPTZ) - Detection timestamp

## AI Classification Criteria

The AI model classifies emails as genuine replies if they contain:

- Questions about the product/service
- Requests for more information
- Scheduling requests
- Positive interest indicators
- Specific responses to the original email content

Emails are classified as NOT genuine replies if they contain:

- Out-of-office messages
- Unsubscribe requests
- Spam/bounce messages
- Generic acknowledgments without substance
- Automated responses

## Environment Variables

Required environment variables:

- `OPENAI_API_KEY` - OpenAI API key for GPT-4o-mini access
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Deployment

1. Deploy the Edge Function to Supabase:
   ```bash
   supabase functions deploy ai-reply-detection
   ```

2. Run the database migration:
   ```bash
   supabase db push
   ```

3. Set environment variables in Supabase dashboard

## Usage Examples

### Webhook Integration

Set up a webhook to trigger the function when new email replies are received:

```sql
CREATE TRIGGER handle_reply
AFTER INSERT ON email_replies
FOR EACH ROW
EXECUTE FUNCTION net.http_post(
  url => 'https://<YOUR-PROJECT>.functions.supabase.co/ai-reply-detection',
  body => json_build_object('lead_id', new.lead_id, 'email_body', new.body)
);
```

### Manual API Call

```javascript
const response = await fetch('https://<YOUR-PROJECT>.functions.supabase.co/ai-reply-detection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    lead_id: '123e4567-e89b-12d3-a456-426614174000',
    email_body: 'Hi, I\'m interested in learning more about your product...'
  })
});

const result = await response.json();
console.log(result);
```

## Monitoring and Analytics

The system automatically logs all detection results to the `reply_detections` table, enabling:

- Classification accuracy analysis
- Response rate tracking
- Performance monitoring
- A/B testing of classification prompts

## Error Handling

The function includes comprehensive error handling for:

- Missing required fields
- Invalid lead IDs
- Database connection issues
- OpenAI API failures
- Malformed requests

All errors are logged with timestamps for debugging and monitoring.

## Performance Considerations

- Uses GPT-4o-mini for cost-effective classification
- Low temperature setting (0.1) for consistent results
- Email body truncation to 1000 characters for storage efficiency
- Database indexes for fast queries
- Async processing for non-blocking operations

## Future Enhancements

Potential improvements:

1. **Confidence Scoring**: Add confidence levels to classifications
2. **Intent Analysis**: Detect specific types of interest (demo request, pricing, etc.)
3. **Sentiment Analysis**: Analyze emotional tone of replies
4. **Auto-Response**: Trigger automated follow-up sequences
5. **Learning Loop**: Use feedback to improve classification accuracy