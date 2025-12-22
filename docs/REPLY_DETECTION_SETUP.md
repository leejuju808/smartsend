# Reply Detection System Setup

## Overview

This system automatically classifies inbound emails as real replies, auto-replies, or bounces, and updates lead statuses accordingly. It uses heuristics and OpenAI's GPT-4o-mini for intelligent classification.

## Architecture

1. **Edge Function** (`reply-detection`): Receives webhook calls from email providers
2. **Database Tables**:
   - `inbound_emails`: Stores all inbound emails with classification
   - `leads`: Updated with "replied" status
   - `campaign_logs`: Logs reply events

## Setup Steps

### 1. Run SQL Migration

Run the migration file in your Supabase SQL editor:

```sql
-- File: supabase/migrations/20250131000000_add_inbound_emails_table.sql
```

This creates:
- `inbound_emails` table with indexes
- RLS policies for service role access
- Indexes on `leads` and `campaign_logs` for fast lookups

### 2. Deploy Edge Function

```bash
supabase functions deploy reply-detection
```

### 3. Set Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-your-api-key
supabase secrets set REPLY_DETECT_DRY_RUN=false
```

Secrets:
- `OPENAI_API_KEY`: Required for AI classification
- `REPLY_DETECT_DRY_RUN`: Set to `true` to test without making changes

### 4. Configure Provider Webhook

Point your email provider's inbound webhook to:

```
https://<your-project-ref>.functions.supabase.co/reply-detection
```

**Expected Payload** (JSON):
```json
{
  "provider": "resend",
  "provider_message_id": "abc123",
  "from_email": "ceo@acme.com",
  "subject": "Re: Quick question",
  "body_text": "Hey Julian — yes, let's talk.",
  "body_html": "<p>Hey Julian — yes, let's talk.</p>",
  "campaign_id": "optional-uuid",
  "lead_id": "optional-uuid",
  "workspace_id": "optional-uuid"
}
```

## How It Works

### Classification Flow

1. **Heuristic Check**: Quick patterns for auto-replies and bounces
2. **AI Classification**: Uses GPT-4o-mini if heuristics don't match
3. **Idempotency**: Skips processing if message already seen
4. **Lead Update**: Marks lead as "replied" if classification is "real_reply"
5. **Campaign Logging**: Records event in `campaign_logs`

### Classification Types

- **real_reply**: Actual response from the lead
- **auto_reply**: Out of office, auto-responders, etc.
- **bounce**: Delivery failures, mailbox full, etc.
- **unknown**: Could not be classified

## Testing

### Dry Run Mode

Set `REPLY_DETECT_DRY_RUN=true` to test without database changes:

```bash
supabase secrets set REPLY_DETECT_DRY_RUN=true
```

### Manual Test

```bash
curl -X POST https://<your-project-ref>.functions.supabase.co/reply-detection \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "test",
    "provider_message_id": "test-123",
    "from_email": "test@example.com",
    "subject": "Re: Test",
    "body_text": "This is a test reply"
  }'
```

### Expected Response

```json
{
  "ok": true,
  "inbound_id": "uuid",
  "classification": "real_reply",
  "updated_lead": true
}
```

## Database Schema

### inbound_emails

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| provider | text | Email provider (resend, gmail, etc.) |
| provider_message_id | text | Unique message ID from provider |
| from_email | text | Sender email address |
| subject | text | Email subject |
| body_text | text | Plain text body |
| body_html | text | HTML body |
| campaign_id | uuid | Related campaign (optional) |
| lead_id | uuid | Related lead (optional) |
| is_reply | boolean | Whether this is a real reply |
| classification | text | Classification result |
| created_at | timestamptz | Timestamp |

### Indexes

- Unique: `(provider, provider_message_id)` - Prevents duplicates
- Index: `from_email` - Fast lead lookup
- Index: `leads(email)` - Fast email search
- Index: `campaign_logs(lead_id, event)` - Fast event queries

## Monitoring

### Check Recent Classifications

```sql
SELECT 
  from_email,
  subject,
  classification,
  created_at
FROM inbound_emails
ORDER BY created_at DESC
LIMIT 20;
```

### Check Reply Rate

```sql
SELECT 
  classification,
  COUNT(*) as count
FROM inbound_emails
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY classification;
```

## Troubleshooting

### Issue: Function not receiving webhooks

1. Check webhook URL is correct
2. Verify secrets are set: `supabase secrets list`
3. Check function logs: `supabase functions logs reply-detection`

### Issue: Classifications are wrong

1. Review heuristic patterns in `quickHeuristics()`
2. Check OpenAI API key is valid
3. Test with specific emails to understand behavior

### Issue: Leads not updating

1. Verify lead exists: `SELECT * FROM leads WHERE email = 'test@example.com'`
2. Check `campaign_logs` for errors
3. Ensure `campaign_logs` table exists with correct schema

## Advanced: Custom Classification

To customize classification behavior, edit `classifyRealReply()` in the Edge Function.

### Modify Heuristics

Add patterns to `quickHeuristics()`:

```typescript
const autoPhrases = [
  "out of office",
  "your custom pattern here",
  // ... existing patterns
];
```

### Change AI Prompt

Modify the prompt in `classifyRealReply()` to add context or adjust behavior.

## Production Checklist

- [ ] SQL migration applied
- [ ] Edge function deployed
- [ ] OPENAI_API_KEY secret set
- [ ] Webhook URL configured with provider
- [ ] Dry run tested successfully
- [ ] Real emails tested (with dry run disabled)
- [ ] Monitoring queries set up
- [ ] Error alerts configured

## Cost Considerations

- **GPT-4o-mini**: ~$0.0001 per classification
- **Database**: Minimal storage for inbound_emails
- **Compute**: Edge function runs only on webhook calls

For high volume, consider:
- Batching classifications
- Increasing heuristic coverage to reduce AI calls
- Caching common patterns

## Security

- Uses Supabase service role for database access
- Idempotent to prevent duplicate processing
- Optional HMAC verification in production
- Rate limiting handled by Supabase platform 