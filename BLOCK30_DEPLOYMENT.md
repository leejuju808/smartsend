# Block 30 Deployment Guide

## Quick Deployment

### 1. Deploy Supabase Function

```bash
cd /Users/juju/smartsend-ai
supabase functions deploy rewriteTemplate
```

If you need to set the project reference:
```bash
supabase functions deploy rewriteTemplate --project-ref your-project-ref
```

### 2. Set Environment Variables (if not already set)

The function needs `OPENAI_API_KEY`:

```bash
supabase secrets set OPENAI_API_KEY=sk-your-key --project-ref your-project-ref
```

### 3. Verify Deployment

```bash
supabase functions list
```

You should see `rewriteTemplate` in the list.

### 4. Test Locally

```bash
npm run dev
```

Navigate to: http://localhost:3000/dashboard/templates

### 5. Test the Function Directly

```bash
curl -X POST https://your-project.supabase.co/functions/v1/rewriteTemplate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "text": "Hey {{first_name}}, hope you are well!",
    "tone": "friendly",
    "length": "short",
    "goal": "book a meeting"
  }'
```

Expected response:
```json
{
  "ok": true,
  "result": "Hello {{first_name}}, I hope you're having a great day! I'd love to schedule a brief call with you this week. Would you be available?"
}
```

## Troubleshooting

### "Function not found"
- Make sure you deployed: `supabase functions deploy rewriteTemplate`
- Check function name matches exactly (case-sensitive)

### "Unauthorized"
- Check `OPENAI_API_KEY` is set in Supabase secrets
- Verify API key is valid

### "Internal server error"
- Check Supabase function logs: `supabase functions logs rewriteTemplate`
- Verify OpenAI API key has credits/quota

### Variables not preserved
- Check the prompt includes "Preserve all {{variables}}"
- Test with a simple template first

## Monitoring

### View Function Logs

```bash
supabase functions logs rewriteTemplate --project-ref your-project-ref
```

### Check Usage

Monitor OpenAI usage:
- OpenAI dashboard: https://platform.openai.com/usage
- Supabase logs show function invocations

## Rollback

If needed, redeploy previous version:

```bash
supabase functions deploy rewriteTemplate --no-verify-jwt
```

## Production Checklist

- [ ] Function deployed to production
- [ ] `OPENAI_API_KEY` set in Supabase secrets
- [ ] Tested with sample templates
- [ ] Verified variable preservation
- [ ] Checked loading states in UI
- [ ] Monitored initial usage
- [ ] Set up alerts for errors

## Cost Estimation

- **Model**: GPT-4o-mini
- **Per rewrite**: ~500-2000 tokens
- **Cost**: ~$0.00015 - $0.0006 per rewrite
- **Monthly (1000 rewrites)**: ~$0.15 - $0.60

## Next Steps

1. Monitor usage patterns
2. Consider adding rate limiting
3. Add analytics to track which tones/goals are most popular
4. Collect user feedback
5. Add more tone options if requested

