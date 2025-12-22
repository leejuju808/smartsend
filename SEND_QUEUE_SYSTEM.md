# Send Queue System

A production-ready atomic job claiming system for processing email sends in batches.

## Architecture

### Components

1. **SQL Function** (`claim_send_queue`): Atomically claims and locks jobs to prevent double-processing
2. **Edge Function** (`send-queue`): Processes claimed jobs, sends emails, and updates status
3. **Database Schema**: Extended `send_queue` table with locking columns

## Setup

### 1. Database Migration

Run the migration to add the claiming function:

```bash
supabase migration up
```

Or manually run in Supabase SQL editor:

```sql
-- See: supabase/migrations/20250129000000_send_queue_claim_function.sql
```

### 2. Deploy Edge Function

```bash
supabase functions deploy send-queue
```

### 3. Configure Secrets

```bash
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set SEND_QUEUE_BATCH_SIZE=50
supabase secrets set SEND_QUEUE_LOCK_TTL=300
```

### 4. Test the Function

Manual invocation:

```bash
supabase functions invoke send-queue --no-verify-jwt --data '{"batch_size": 10}'
```

### 5. Schedule Cron (Optional)

Set up in Supabase Dashboard → Edge Functions → send-queue → Schedule:

- Cron: `* * * * *` (every minute)
- Method: GET

## Usage

### Invoking the Function

**GET request** (default batch size):
```
GET /functions/v1/send-queue
```

**POST request** (custom batch size):
```json
POST /functions/v1/send-queue
{
  "batch_size": 25,
  "lock_ttl_seconds": 300
}
```

### Response Format

Success:
```json
{
  "ok": true,
  "claimed": 10,
  "results": [
    { "id": "uuid", "ok": true },
    { "id": "uuid", "ok": false, "error": "..." }
  ]
}
```

Error:
```json
{
  "ok": false,
  "error": "Error message"
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key for sending emails | Required |
| `SEND_QUEUE_BATCH_SIZE` | Number of jobs to process per invocation | 25 |
| `SEND_QUEUE_LOCK_TTL` | Lock timeout in seconds | 300 |
| `SEND_QUEUE_DRY_RUN` | Skip actual email sending | false |

## How It Works

1. **Claiming Phase**: The SQL function atomically:
   - Finds due jobs with status='pending' and scheduled_for <= now()
   - Skips jobs locked by other workers (within TTL)
   - Updates status to 'sending' and sets lock_token/locked_at
   - Returns locked rows

2. **Processing Phase**: The Edge Function:
   - Fetches lead/contact data
   - Renders email template with merge fields
   - Sends via Resend (or other provider)
   - Updates status to 'sent' or 'failed'

3. **Locking**: Prevents concurrent workers from processing the same job. Locks expire after TTL.

## Template Variables

The system supports Mustache-style variables:

- `{{first_name}}` - Contact first name
- `{{last_name}}` - Contact last name  
- `{{company}}` - Company name
- `{{email}}` - Email address
- Custom fields from `contact.custom_fields` and campaign variables

## Error Handling

Failed jobs are marked with:
- `status = 'failed'`
- `error` field contains error message
- `attempts` incremented

Retry logic can be added by uncommenting the attempts check in the SQL function.

## Limitations

- Currently uses Resend for email delivery (SMTP adapter not implemented)
- Template HTML fetching from campaigns table needs refinement based on your schema
- No automatic retry logic (jobs fail after max attempts)

## Future Improvements

1. Add SMTP adapter for non-Resend providers
2. Implement exponential backoff for retries
3. Add campaign variable support from `campaign_vars` table
4. Support for different email providers (Gmail, Outlook, etc.)
5. Rate limiting per sender domain
6. Bounce handling and suppression list management 