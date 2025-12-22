# Quick Start Guide

## SmartSend MVP + OpsGrid WhatsApp Integration

### Step 1: Run Database Migrations

Go to Supabase Dashboard → SQL Editor and run:

1. `supabase/migrations/99999999999999_smartsend_mvp_setup.sql`
2. `supabase/migrations/99999999999998_opsgrid_whatsapp.sql`

### Step 2: Environment Setup

Add to your `.env.local`:

```bash
# WhatsApp (already added to env.template)
WHATSAPP_VERIFY_TOKEN=dev-verify-token
WHATSAPP_ACCESS_TOKEN=your_whatsapp_business_access_token
```

### Step 3: Seed Test Data

Run this in Supabase SQL Editor:

```sql
-- Seed a test campaign
insert into campaigns (id, name)
values ('11111111-1111-1111-1111-111111111111', 'MVP Test') 
on conflict (id) do nothing;

-- Seed test leads
insert into leads (campaign_id, email, status)
values
  ('11111111-1111-1111-1111-111111111111', 'jane@example.com', 'new'),
  ('11111111-1111-1111-1111-111111111111', 'john@example.com', 'failed');
```

### Step 4: Test

#### WhatsApp Webhook
```bash
./test-whatsapp-webhook.sh http://localhost:3000
```

#### SmartSend MVP
Follow the checklist in `MVP_TEST_CHECKLIST.md`

### Step 5: Configure WhatsApp Webhook

1. Go to Meta Developer Console
2. Navigate to your WhatsApp Business App → Configuration → Webhooks
3. Set:
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify Token**: `dev-verify-token` (or your custom token)
   - **Subscribe to**: Messages

## What Was Implemented

✅ SmartSend MVP test setup with database schema
✅ WhatsApp webhook integration for OpsGrid
✅ Test scripts for both features
✅ Comprehensive documentation

## Files Created

- `supabase/migrations/99999999999999_smartsend_mvp_setup.sql`
- `supabase/migrations/99999999999998_opsgrid_whatsapp.sql`
- `src/app/api/whatsapp/webhook/route.ts`
- `MVP_TEST_CHECKLIST.md`
- `IMPLEMENTATION_SUMMARY.md`
- `test-whatsapp-webhook.sh`
- `test-smartsend-mvp.sh`

## Next Steps

1. **SmartSend**: Follow `MVP_TEST_CHECKLIST.md` to verify all features
2. **WhatsApp**: Configure Meta webhook (see Step 5 above)
3. **Build Inbox**: Create `/ops/inbox` UI for WhatsApp conversations

For detailed information, see:
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `MVP_TEST_CHECKLIST.md` - Test procedures
