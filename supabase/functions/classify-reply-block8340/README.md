# Block 8340 — Auto-Intent Processing

This Edge Function implements Block 8340 for auto-classifying campaign replies.

**Note:** There's already a `classify-reply` function in this codebase that works with `inbox_threads`. This implementation is specifically for `campaign_replies` table as per Block 8340 spec.

To use this function, you can either:
1. Rename this directory to `classify-reply` (replacing the existing one)
2. Keep both functions and use this one specifically for `campaign_replies` table
3. Integrate both functionalities into a single function

## Usage

```bash
POST /functions/v1/classify-reply-block8340
{
  "reply_id": "uuid-of-reply",
  "force": false  // optional, force re-classification
}
```

## Environment Variables Required

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`































































