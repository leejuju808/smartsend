# AUREV HQ Developer Platform - Implementation Guide

**Vision:** Turn AUREV HQ into an open developer platform that allows anyone to build, deploy, and monetize automations and AI agents across SmartSend ⚡ OpsGrid 🧩 Agent Cloud 🤖.

## 🎯 Targets

- **100+ developers onboarded** by Oct 2026
- **50+ public extensions** in marketplace
- **10+ white-label deployments** live
- **$20K/month** in partner revenue share

## 📦 What Was Implemented

### 1. Database Schema ✅

**File:** `supabase/migrations/20260103000000_aurev_developer_platform.sql`

#### Core Tables

- **`extensions`** - Extension marketplace listings with pricing, approval workflow
- **`extension_installations`** - Track which orgs have installed which extensions
- **`extension_payouts`** - Revenue sharing and payouts to developers
- **`developer_api_keys`** - API keys for developer platform access
- **`developer_api_usage`** - Track API usage per key with rate limiting
- **`white_label_deployments`** - Partner-branded deployments

**Key Features:**
- RLS policies for multi-tenant security
- Automatic usage tracking with atomic counters
- Stripe Connect integration ready
- Helper functions for common operations

### 2. API Gateway ✅

**Base URL:** `/api/hq/v1`

#### Implemented Routes

**Authentication:**
- `POST /api/hq/v1/auth/token` - Exchange API key for JWT

**Organizations:**
- `GET /api/hq/v1/orgs` - List orgs
- `POST /api/hq/v1/orgs` - Create org
- `GET /api/hq/v1/orgs/:id` - Get org details
- `PATCH /api/hq/v1/orgs/:id` - Update org

**Leads:**
- `GET /api/hq/v1/leads` - List leads
- `POST /api/hq/v1/leads` - Create lead

**Campaigns:**
- `GET /api/hq/v1/campaigns` - List campaigns

**Files:**
- `src/lib/aurev-hq/api-auth.ts` - JWT + API key authentication middleware
- `src/app/api/hq/v1/orgs/route.ts`
- `src/app/api/hq/v1/orgs/[id]/route.ts`
- `src/app/api/hq/v1/leads/route.ts`
- `src/app/api/hq/v1/campaigns/route.ts`
- `src/app/api/hq/v1/auth/token/route.ts`

**Authentication:**
- Supports both JWT (from Supabase Auth) and API key authentication
- Automatic rate limiting: 100 req/min per key
- Usage tracking with atomic counters
- Org-scoped and global API keys

### 3. Developer Portal UI ✅

**File:** `src/app/dev/page.tsx`

Comprehensive developer dashboard featuring:
- **Overview** - Key metrics (API keys, extensions, installs, earnings)
- **Quick Actions** - Navigation to all developer tools
- **Recent Activity** - Timeline of developer actions

**Sub-pages:**

**API Keys Management** (`src/app/dev/keys/page.tsx`):
- Create, view, and revoke API keys
- Secure key generation with one-time display
- Last-used tracking
- Security best practices guide

**Documentation Hub** (`src/app/dev/docs/page.tsx`):
- Getting started guide
- API reference
- Authentication docs
- SDK documentation

**API Backend:**
- `src/app/api/dev/api-keys/route.ts` - CRUD for developer API keys

## 🔧 How It Works

### Authentication Flow

1. Developer creates API key via `/dev/keys`
2. Key is stored hashed with SHA-256
3. Requests include `Authorization: Bearer <api_key>` header
4. Middleware authenticates and returns user/org context
5. Rate limiting enforced: 100 req/min default
6. Usage tracked atomically per endpoint

### Extension Flow

1. Developer publishes extension via `/dev/extensions`
2. Extension enters "pending" approval state
3. Admin reviews and approves/rejects
4. Approved extensions visible in marketplace
5. Orgs install extensions
6. Usage tracked for billing
7. Revenue shared via Stripe Connect

### White-Label Flow

1. Partner creates deployment via `/dev/white-label`
2. Configure branding, domain, modules
3. Status tracked: pending → active → deployed
4. Partner manages their branded stack
5. Revenue tracked per deployment

## 🚀 Next Steps

### Immediate (Week 1-2)

1. **Complete API Gateway**
   - [ ] Add remaining endpoints: agents, events, metrics
   - [ ] Webhook router for real-time events
   - [ ] OAuth flow for third-party apps

2. **Extension SDK**
   - [ ] Node.js SDK (`aurev-sdk` npm package)
   - [ ] Python SDK (`aurev` PyPI package)
   - [ ] TypeScript type definitions
   - [ ] Webhook verification helpers

3. **Developer Portal**
   - [ ] Extensions listing/management
   - [ ] Analytics dashboard with usage charts
   - [ ] Earnings dashboard
   - [ ] Marketplace browser

### Short-term (Month 2-3)

4. **Monetization**
   - [ ] Stripe Connect integration
   - [ ] Automatic payout processing
   - [ ] Pricing tiers configuration
   - [ ] Usage-based billing

5. **White-Label Layer**
   - [ ] Partner onboarding flow
   - [ ] Brand customization UI
   - [ ] Deployment automation
   - [ ] Reseller dashboard

6. **Marketplace**
   - [ ] Extension discovery/search
   - [ ] Categories and tags
   - [ ] Ratings and reviews
   - [ ] Install/uninstall UI

### Long-term (Month 4-6)

7. **Agent Marketplace 2.0**
   - [ ] Deploy AI agents to SmartSend/OpsGrid
   - [ ] Agent Cloud integration
   - [ ] Agent templates library

8. **Analytics & Insights**
   - [ ] API usage analytics
   - [ ] Extension performance metrics
   - [ ] Revenue dashboards
   - [ ] Usage forecasting

9. **Developer Tools**
   - [ ] Testing sandbox
   - [ ] Local development CLI
   - [ ] CI/CD templates
   - [ ] Marketplace submission workflow

## 📊 Database Schema Details

### Extensions Table

```sql
CREATE TABLE extensions (
  id UUID PRIMARY KEY,
  developer_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'automation', 'ai', 'integration', etc.
  pricing JSONB, -- {"type": "free"} or {"type": "paid", "amount": 1000}
  status TEXT CHECK (status IN ('draft', 'pending', 'approved')),
  is_public BOOLEAN DEFAULT true,
  install_count INTEGER DEFAULT 0,
  ...
);
```

### Developer API Keys

```sql
CREATE TABLE developer_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL, -- SHA-256 hash
  org_id UUID REFERENCES orgs, -- NULL = global
  rate_limit_per_min INTEGER DEFAULT 100,
  status TEXT CHECK (status IN ('active', 'revoked', 'suspended')),
  ...
);
```

### Extension Payouts

```sql
CREATE TABLE extension_payouts (
  id UUID PRIMARY KEY,
  extension_id UUID REFERENCES extensions,
  amount_cents BIGINT NOT NULL,
  status TEXT CHECK (status IN ('accrued', 'queued', 'paid', 'failed')),
  stripe_payout_id TEXT,
  ...
);
```

## 🔐 Security

- **Row-Level Security (RLS)** on all tables
- **API keys** hashed with SHA-256 before storage
- **JWT** authentication for session-based access
- **Rate limiting** enforced per key
- **Org-scoped** access control
- **Service role** only for system operations

## 📝 Example API Usage

### Create API Key

```typescript
POST /api/dev/api-keys
{
  "name": "Production Key"
}

Response: {
  "key": "sk_live_abc123..."
}
```

### Use API Key

```bash
curl -X GET https://aurevhq.com/api/hq/v1/orgs \
  -H "Authorization: Bearer sk_live_abc123..."
```

### SDK Usage (Future)

```javascript
import { AurevClient } from 'aurev-sdk';

const client = new AurevClient({ 
  apiKey: process.env.AUREV_API_KEY 
});

const leads = await client.leads.list({ org_id: 'org123' });
await client.leads.create({ 
  org_id: 'org123',
  email: 'lead@example.com',
  first_name: 'John'
});
```

## 🧪 Testing

### Test API Gateway

```bash
# Create API key first via /dev/keys UI

# Test authentication
curl -X GET http://localhost:3000/api/hq/v1/orgs \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test rate limiting
for i in {1..150}; do
  curl -X GET http://localhost:3000/api/hq/v1/orgs \
    -H "Authorization: Bearer YOUR_API_KEY"
done
```

## 🎯 Success Metrics

Track these KPIs:

- **Registered Developers** - Target: 100+ by Oct 2026
- **Published Extensions** - Target: 50+
- **Total Installations** - Target: 1000+
- **API Calls/Day** - Target: 100K+
- **Revenue Shared** - Target: $20K/month
- **White-Label Partners** - Target: 10+

## 📚 Documentation

- [Getting Started Guide](#) - TBD
- [API Reference](#) - TBD
- [SDK Documentation](#) - TBD
- [Payout Guide](#) - TBD

## 🤝 Contributing

Contributions welcome! See CONTRIBUTING.md for guidelines.

## 📄 License

MIT License - See LICENSE file

---

**Status:** Core platform implemented ✅  
**Next:** SDK development and monetization integration  
**ETA:** Full launch Q3 2026

