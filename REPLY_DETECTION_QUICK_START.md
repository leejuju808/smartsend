# Reply Detection Quick Start

## Files Created/Updated

1. **Migration**: `supabase/migrations/20251101_reply_detection_system.sql`
2. **Edge Function**: `supabase/functions/reply-detection/index.ts` (updated)
3. **Webhook Route**: `src/app/api/webhooks/reply/route.ts` (updated)
4. **UI**: Already supports "replied" status via `StatusBadge` component

## Quick Deploy

```bash
# 1. Push database migration
supabase db push

# 2. Deploy edge function
supabase functions deploy reply-detection

# 3. Set environment variables in Supabase Dashboard
# Edge Functions → reply-detection → Settings
OPENAI_API_KEY=sk-...
REPLY_WEBHOOK_SECRET=your-secret-here

# 4. Set Next.js environment variable (.env.local)
SUPABASE_REPLY_FUNCTION_URL=https://<project>.functions.supabase.co/reply-detection
REPLY_WEBHOOK_SECRET=your-secret-here
```

## Testing

```bash
# Test human reply
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Interested",
    "body": "This sounds great! Let us schedule a call.",
    "provider": "test"
  }'

# Test auto-reply (should be ignored)
curl -X POST http://localhost:3000/api/webhooks/reply \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Out of Office",
    "body": "I am currently out of the office..."
  }'
```

## How It Works

1. **Email arrives** → Webhook receives payload
2. **Normalized** → Extracts email, subject, body
3. **AI classified** → OpenAI determines if human reply
4. **Lead found** → Looks up by email or lead_id
5. **Updated** → `mark_lead_replied()` called
6. **Cancels future** → Pending queue items canceled
7. **Logged** → Event recorded in campaign_logs

## Next Steps

- Point your email provider webhook to `/api/webhooks/reply`
- Configure `REPLY_WEBHOOK_SECRET` in production
- Monitor `campaign_logs` for reply events
- Check lead status filters include "replied"

## Troubleshooting

**"Unauthorized" errors**: Check `REPLY_WEBHOOK_SECRET` matches
**No lead found**: Verify email matches exactly (case-insensitive)
**AI not classifying correctly**: Check OpenAI API key and quota
**Queue not canceling**: Verify `workspace_id` and `lead_id` match

