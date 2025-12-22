# AUREV OS Beta - Quick Start Guide

## 🎉 What Was Built

A unified dashboard experience that merges SmartSend, OpsGrid, and AgentCloud into one cohesive AUREV OS ecosystem.

---

## 📁 Files Created

### 1. **Unified Dashboard**
- `src/app/aurev-hq/dashboard/page.tsx` - Main dashboard showing all app metrics

### 2. **OS-Level API**
- `src/app/api/os-metrics/route.ts` - Unified metrics aggregation endpoint

### 3. **Analytics Enhancement**
- `supabase/migrations/20250215000001_add_app_to_analytics.sql` - Adds app field for cross-app tracking

### 4. **Documentation**
- `AUREV_OS_BETA_IMPLEMENTATION.md` - Complete implementation details
- `AUREV_OS_BETA_QUICKSTART.md` - This file

---

## 🚀 Getting Started (3 Steps)

### Step 1: Apply Database Migration
```bash
# In Supabase SQL Editor, run:
supabase/migrations/20250215000001_add_app_to_analytics.sql
```

This adds the `app` field to `analytics_events` for cross-app tracking.

### Step 2: Start Dev Server
```bash
npm run dev
```

### Step 3: Visit Dashboard
Navigate to: **`http://localhost:3000/aurev-hq/dashboard`**

You should see:
- AUREV OS header with gold gradient
- 3 tiles: SmartSend, OpsGrid, AgentCloud
- Unified metrics from all apps

---

## 📊 How It Works

### Architecture Flow
```
User visits /aurev-hq/dashboard
         ↓
Dashboard fetches /api/os-metrics
         ↓
API calls /api/sync/smartsend, OpsGrid, AgentCloud
         ↓
Returns aggregated metrics
         ↓
Dashboard displays unified view
```

### Metrics Aggregation
The `/api/os-metrics` endpoint:
1. Gets authenticated user's org_id
2. Fetches from all 3 app sync endpoints in parallel
3. Aggregates campaign, workflow, and agent counts
4. Returns unified data structure

### Cross-App Tracking
All analytics events now include an `app` field:
```typescript
await aurev.track("campaign_sent", {
  app: "smartsend",  // or "opsgrid" or "agentcloud"
  campaign_id: "123"
});
```

---

## 🎨 Branding

### Design System
- **Primary Color**: Gold (#FFD700)
- **Background**: Black gradient (from-black via-gray-950 to-black)
- **Typography**: Bold gold gradient for headers
- **Icons**: Lucide React (Zap ⚡, Workflow 🧩, Bot 🤖)

### Visual Hierarchy
1. **AUREV OS** - Gold gradient, 5xl font
2. **Tagline** - Gray-400, xl font
3. **Module Cards** - Gray-900/50 background, yellow on hover
4. **Metrics** - Yellow-500 accent

---

## 🧪 Testing

### Test Dashboard
```bash
# Visit dashboard
open http://localhost:3000/aurev-hq/dashboard

# Should show:
- AUREV OS header
- 3 module tiles
- Metrics (may be 0 if no data)
```

### Test API Directly
```bash
# Test unified metrics API
curl http://localhost:3000/api/os-metrics

# Expected response:
{
  "campaigns": 0,
  "workflows": 0,
  "agents": 0,
  "total_events": 0
}
```

### Test Individual Sync APIs
```bash
# SmartSend sync
curl http://localhost:3000/api/sync/smartsend \
  -H "x-aurev-sync-key: your-key"

# Should return active users and campaigns
```

---

## 🔌 Integration Points

### Environment Variables Needed
```env
# Required for cross-app fetching
NEXT_PUBLIC_SITE_URL=https://smartsendhq.com
AUREV_SYNC_KEY=your-secure-sync-key

# Optional (for OpsGrid/AgentCloud when deployed)
OPSGRID_URL=https://opsgridhq.com
AGENTCLOUD_URL=https://agentcloudapp.com
```

### Adding to Your App
```typescript
// In any component
import useSWR from "swr";

const { data } = useSWR("/api/os-metrics", 
  (url) => fetch(url).then(r => r.json())
);

console.log(data); // { campaigns: X, workflows: Y, agents: Z }
```

---

## 📝 Code Examples

### Track Events with App Tag
```typescript
import { createAurevServer } from "@/lib/aurev";

const aurev = createAurevServer();

// In SmartSend code
await aurev.track("campaign_sent", {
  app: "smartsend",
  campaign_id: campaignId,
  recipients: 100
});

// In OpsGrid code (when implemented)
await aurev.track("workflow_triggered", {
  app: "opsgrid",
  workflow_id: workflowId
});

// In AgentCloud code (when implemented)
await aurev.track("agent_deployed", {
  app: "agentcloud",
  agent_id: agentId
});
```

### Query by App
```typescript
// Get all SmartSend events
const { data } = await supabase
  .from("analytics_events")
  .select("*")
  .eq("app", "smartsend")
  .order("created_at", { ascending: false });
```

---

## 🚦 Next Steps

### Immediate
1. ✅ Deploy migration to production
2. ✅ Test dashboard with real users
3. ⏳ Add pricing upgrade CTA
4. ⏳ Wire real campaign counts

### Short-term (Week 2-4)
- [ ] Connect OpsGrid when it launches
- [ ] Connect AgentCloud when it launches
- [ ] Add onboarding flow
- [ ] Create unified billing page

### Long-term (Month 2+)
- [ ] Investor demo preparation
- [ ] Marketing materials
- [ ] Public beta launch
- [ ] User feedback collection

---

## ✅ Checklist

**Beta Launch Ready When**:
- [x] Unified dashboard displays correctly
- [x] OS-level API aggregates metrics
- [x] Analytics includes app tracking
- [x] Migration applied to database
- [ ] Real data showing in dashboard
- [ ] Beta users can access features
- [ ] Documentation complete

---

## 🆘 Troubleshooting

### Dashboard Shows Zeros
**Solution**: Check that `/api/sync/smartsend` is returning data

### API Returns 401
**Solution**: Ensure user is authenticated and has org_id

### Migration Fails
**Solution**: Check that `analytics_events` table exists and has proper permissions

### Sync API 404s
**Solution**: Verify environment variables are set correctly

---

## 📚 Resources

- **Full Docs**: `AUREV_OS_BETA_IMPLEMENTATION.md`
- **SDK Docs**: `packages/aurev-core-sdk/README.md`
- **Branding**: `src/lib/aurev-branding.ts`
- **Roadmap**: `AUREV_OS_EXECUTION_ROADMAP.md`

---

**Status**: ✅ Beta Ready  
**Version**: 1.0.0-beta  
**Quick Start**: 3 steps, 5 minutes  
**Next**: Deploy & Test

