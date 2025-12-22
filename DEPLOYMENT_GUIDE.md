# AUREV HQ Developer Platform - Deployment Guide

## 🚀 Quick Deployment

### 1. Database Migration

Run the migration to create all developer platform tables:

```bash
cd /Users/juju/smartsend-ai
supabase db push
```

Or manually via Supabase Dashboard → SQL Editor:
1. Open `supabase/migrations/20260103000000_aurev_developer_platform.sql`
2. Copy and paste into SQL Editor
3. Run

**Verify:** Check that these tables were created:
- `extensions`
- `extension_installations`
- `extension_payouts`
- `developer_api_keys`
- `developer_api_usage`
- `white_label_deployments`

### 2. Test Locally

```bash
# Start development server
npm run dev

# Open developer portal
open http://localhost:3000/dev

# Open API keys page
open http://localhost:3000/dev/keys
```

### 3. Create Your First API Key

1. Navigate to `http://localhost:3000/dev/keys`
2. Click "New Key"
3. Enter a name (e.g., "Development Key")
4. Click "Create Key"
5. **Copy the key immediately** (it won't be shown again)
6. Store it securely

### 4. Test the API

```bash
# Replace YOUR_API_KEY with the key from step 3
curl -X GET http://localhost:3000/api/hq/v1/orgs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "orgs": [...]
}
```

### 5. Test Rate Limiting

```bash
# This should work for the first 100 requests
for i in {1..105}; do
  echo "Request $i"
  curl -X GET http://localhost:3000/api/hq/v1/orgs \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -s -o /dev/null -w "%{http_code}\n"
  sleep 0.1
done
```

You should see `200` for requests 1-100, then `429` for 101+.

## 📋 Environment Variables

Ensure these are set in `.env.local`:

```bash
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe (for future monetization)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## 🧪 Testing Checklist

### Database Tests

- [ ] `extensions` table exists
- [ ] `developer_api_keys` table exists
- [ ] RLS policies are active
- [ ] `developer_api_usage_inc()` function works
- [ ] `track_extension_install()` function works

### API Tests

- [ ] Create API key via `/dev/keys`
- [ ] List API keys
- [ ] Revoke API key
- [ ] Authenticate with API key
- [ ] Rate limiting works (100 req/min)
- [ ] Usage tracking increments
- [ ] Last-used timestamp updates

### UI Tests

- [ ] `/dev` loads correctly
- [ ] Stats display (even if 0s)
- [ ] Navigation works
- [ ] Create key flow works
- [ ] Copy to clipboard works
- [ ] Key display is one-time only

### Security Tests

- [ ] API keys are hashed in database
- [ ] Raw keys not in database
- [ ] Authentication fails with wrong key
- [ ] Rate limiting enforced
- [ ] RLS policies prevent unauthorized access

## 🐛 Troubleshooting

### "Table does not exist"

**Solution:** Run migration:
```bash
supabase db push
```

### "Invalid API key"

**Solution:** 
1. Check you copied the full key
2. Verify key exists in database: `SELECT * FROM developer_api_keys;`
3. Regenerate a new key

### "Rate limit exceeded"

**Solution:** 
1. Wait 60 seconds
2. Or create a new API key
3. Or increase rate limit in database

### Portal not loading

**Solution:**
1. Check `npm run dev` is running
2. Check browser console for errors
3. Verify you're logged in

### Database permission denied

**Solution:**
1. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'developer_api_keys';`
2. Verify user is authenticated
3. Check org membership

## 📊 Monitoring

### Key Metrics to Track

1. **API Usage**
   ```sql
   SELECT 
     COUNT(*) as total_requests,
     COUNT(DISTINCT key_id) as unique_keys,
     DATE_TRUNC('hour', window_start) as hour
   FROM developer_api_usage
   GROUP BY hour
   ORDER BY hour DESC
   LIMIT 24;
   ```

2. **Rate Limit Violations**
   ```sql
   -- Check logs for 429 responses
   ```

3. **Active API Keys**
   ```sql
   SELECT COUNT(*) 
   FROM developer_api_keys 
   WHERE status = 'active';
   ```

4. **Extension Installations**
   ```sql
   SELECT 
     extension_id,
     COUNT(*) as install_count
   FROM extension_installations
   WHERE status = 'active'
   GROUP BY extension_id
   ORDER BY install_count DESC;
   ```

## 🚢 Production Deployment

### 1. Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Database migration applied
- [ ] Environment variables set
- [ ] API rate limits configured
- [ ] Stripe keys configured (if monetization enabled)
- [ ] Logging configured
- [ ] Monitoring configured

### 2. Deploy Database

```bash
# Production Supabase
supabase link --project-ref your-production-ref
supabase db push
```

### 3. Deploy Code

```bash
# Vercel/Netlify/Platform
npm run build
# Deploy via your platform
```

### 4. Post-Deployment

- [ ] Verify `/dev` loads in production
- [ ] Create production API key
- [ ] Test API in production
- [ ] Check logs for errors
- [ ] Monitor rate limiting
- [ ] Set up alerts

## 🔗 Next Steps

1. **Complete API Gateway**
   - Add agents, events, metrics endpoints
   - Implement webhooks
   - OAuth flow

2. **Build SDKs**
   - Node.js package
   - Python package
   - Publish to npm/PyPI

3. **Monetization**
   - Stripe Connect setup
   - Payout automation
   - Pricing UI

4. **Marketplace**
   - Extension browser
   - Installation flows
   - Ratings system

See `AUREV_HQ_DEVELOPER_PLATFORM.md` for full roadmap.

## 📞 Support

- **Documentation:** `AUREV_HQ_DEVELOPER_PLATFORM.md`
- **Implementation:** `IMPLEMENTATION_SUMMARY.md`
- **Issues:** Open GitHub issue
- **Questions:** Contact julian@smartsendhq.com

---

**Status:** Core platform deployed ✅  
**Version:** 1.0.0  
**Last Updated:** January 2026

