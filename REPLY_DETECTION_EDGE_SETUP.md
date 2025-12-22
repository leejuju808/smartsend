## Reply Detection: Edge Function + Webhook Proxy

### Env vars (Supabase → Functions)
- **OPENAI_API_KEY**
- **SUPABASE_URL**
- **SUPABASE_SERVICE_ROLE_KEY**
- **REPLY_WEBHOOK_SECRET** (long random string)

### Deploy Edge Function
```bash
supabase functions deploy replyDetection
supabase functions serve --env-file ./supabase/.env # local test
```

### Public invoke URL
- POST `https://<PROJECT-REF>.functions.supabase.co/replyDetection`
- Header: `x-reply-secret: <REPLY_WEBHOOK_SECRET>`
- Body: `{ provider, from_email, to_email, subject, body, thread_id? }`

### Next.js proxy (optional)
- File: `src/app/api/webhooks/email/route.ts`
- Env vars (Next.js):
  - **SB_REPLY_FN_URL** → your Supabase function URL
  - **REPLY_WEBHOOK_SECRET** → same secret

Point provider webhook to:
- POST `https://yourapp.com/api/webhooks/email`
- Add header `x-provider: resend` (or your provider)

### Test button (internal)
- Use `components/dev/TestReplyButton.tsx`
```
<TestReplyButton />
```

### Behavior
- Writes raw inbound to `public.inbound_messages`.
- If AI says YES, sets `leads.status = 'replied'`, cancels `send_queue` for those leads, and inserts a `campaign_logs` row with `event = 'reply_detected'`.

