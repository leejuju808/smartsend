# AUREV HQ Developer Platform 🚀

**Open developer platform for building, deploying, and monetizing automations and AI agents across SmartSend ⚡ OpsGrid 🧩 Agent Cloud 🤖**

## 🎯 Mission

Transform AUREV HQ into an open developer ecosystem where anyone can create and monetize extensions that integrate across the entire AUREV stack.

**Targets by Oct 2026:**
- 100+ registered developers
- 50+ public extensions in marketplace
- 10+ white-label deployments
- $20K/month in revenue share

## 📦 What's Included

### ✅ Core Infrastructure (Implemented)

1. **Database Schema**
   - `extensions` - Extension marketplace with approval workflow
   - `extension_installations` - Track org installations
   - `extension_payouts` - Revenue sharing with Stripe Connect
   - `developer_api_keys` - Secure API key management
   - `developer_api_usage` - Usage tracking & rate limiting
   - `white_label_deployments` - Partner branding system

2. **API Gateway** (`/api/hq/v1`)
   - JWT + API key authentication
   - Rate limiting (100 req/min)
   - Unified REST endpoints for orgs, leads, campaigns
   - Usage tracking and analytics

3. **Developer Portal** (`/dev`)
   - Dashboard with key metrics
   - API key management
   - Documentation hub
   - Beautiful black & gold UI

### 🚧 Coming Soon

- Extension SDKs (Node.js, Python)
- Marketplace & discovery
- Monetization integration
- White-label deployment tools
- Agent marketplace 2.0

## 🚀 Quick Start

### 1. Deploy Database

```bash
supabase db push
```

### 2. Access Portal

```bash
npm run dev
open http://localhost:3000/dev
```

### 3. Create API Key

1. Go to `/dev/keys`
2. Click "New Key"
3. Copy the key (shown once)
4. Use in API requests

### 4. Test API

```bash
curl -X GET http://localhost:3000/api/hq/v1/orgs \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 📁 File Structure

```
supabase/migrations/
  └── 20260103000000_aurev_developer_platform.sql  # Database schema

src/lib/aurev-hq/
  └── api-auth.ts                                   # Authentication middleware

src/app/api/hq/v1/
  ├── auth/token/route.ts                          # Token exchange
  ├── orgs/route.ts                                # List/create orgs
  ├── orgs/[id]/route.ts                           # Get/update org
  ├── leads/route.ts                               # List/create leads
  └── campaigns/route.ts                           # List campaigns

src/app/api/dev/
  └── api-keys/route.ts                            # API key CRUD

src/app/dev/
  ├── page.tsx                                     # Main dashboard
  ├── keys/page.tsx                                # API keys UI
  └── docs/page.tsx                                # Documentation hub

AUREV_HQ_DEVELOPER_PLATFORM.md                    # Complete guide
IMPLEMENTATION_SUMMARY.md                         # What was built
DEPLOYMENT_GUIDE.md                               # Deployment steps
```

## 🔑 Key Features

### Authentication
- **Dual auth**: JWT (Supabase) + API keys
- **Secure storage**: Keys hashed with SHA-256
- **Rate limiting**: 100 req/min per key
- **Usage tracking**: Atomic counters

### Security
- Row-Level Security (RLS) on all tables
- Org-scoped access control
- One-time key display
- Comprehensive error handling

### Developer Experience
- Beautiful, modern UI
- Progressive disclosure
- Clear documentation
- Real-time metrics

## 📊 Architecture

```
┌──────────────────────────────────────────────┐
│  Developer Portal (/dev)                     │
│  Dashboard, Keys, Docs                       │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│  API Gateway (/api/hq/v1)                   │
│  REST endpoints for all resources           │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│  Auth Middleware                             │
│  JWT + API key validation                   │
│  Rate limiting                              │
└────────────────┬─────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────┐
│  Supabase Database                           │
│  RLS policies                               │
│  Atomic operations                          │
└──────────────────────────────────────────────┘
```

## 📚 Documentation

- **[Complete Platform Guide](AUREV_HQ_DEVELOPER_PLATFORM.md)** - Full implementation details
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - What was built
- **[Deployment Guide](DEPLOYMENT_GUIDE.md)** - Step-by-step deployment
- **Developer Portal** - `/dev` in your browser

## 🧪 Testing

```bash
# Create API key via UI
open http://localhost:3000/dev/keys

# Test authentication
curl -X GET http://localhost:3000/api/hq/v1/orgs \
  -H "Authorization: Bearer YOUR_API_KEY"

# Test rate limiting (should fail after 100)
for i in {1..105}; do
  curl -X GET http://localhost:3000/api/hq/v1/orgs \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -w "%{http_code}\n"
done
```

## 🎯 Next Milestones

### Week 1-2
- [ ] Complete API gateway (agents, events, metrics)
- [ ] Extension SDK v1 (Node.js)
- [ ] Developer analytics dashboard

### Month 2-3
- [ ] Stripe Connect integration
- [ ] Marketplace UI
- [ ] White-label system

### Month 4-6
- [ ] Agent marketplace 2.0
- [ ] Advanced analytics
- [ ] Developer tools & CLI

## 📈 Metrics

Track these KPIs:
- Registered developers
- Published extensions
- Total installations
- API calls/day
- Revenue shared
- White-label partners

## 🤝 Contributing

We welcome contributions! The platform is designed to grow with the community.

## 📄 License

MIT License

## 🎉 Status

**Core Platform:** ✅ COMPLETE & READY  
**Launch Target:** Q3 2026  
**Built with:** Next.js, TypeScript, Supabase

---

**Questions?** See [Deployment Guide](DEPLOYMENT_GUIDE.md) or contact julian@smartsendhq.com

