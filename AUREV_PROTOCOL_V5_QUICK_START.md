# AUREV Protocol v5 - Quick Start Guide

## 🚀 Getting Started

### 1. Run Database Migration

```bash
npx supabase migration up
```

This will create all AUREV Protocol v5 tables and functions.

### 2. Register Your First Node

```typescript
import { getProtocolEngine } from '@/lib/aurev5/protocol-engine'

const protocol = getProtocolEngine()

// Register as human node
const node = await protocol.registerNode(
  'human',
  'your-user-id-or-email',
  {
    displayName: 'Your Name',
    cognitiveProfile: {
      reasoning: 75,
      memory: 80,
    },
  }
)
```

### 3. Submit Your First Knowledge Claim

```typescript
const claim = await protocol.submitClaim(
  node.id,
  'insight',
  {
    insight: 'Campaign reply rates increase 20% with personalized subject lines',
    confidence: 85,
    evidence: ['A/B test results', 'Historical data'],
  },
  {
    context: { domain: 'marketing', metric: 'reply_rate' },
  }
)
```

### 4. Record Your First PoI Action

```typescript
const poiAction = await protocol.recordPOIAction(
  node.id,
  'optimize_campaign',
  {
    campaignId: 'camp-123',
    objective: 'maximize_reply_rate',
  },
  {
    optimizationScore: 85,
    decisionContext: {
      alternatives: ['increase_frequency', 'change_timing'],
      chosen: 'optimize_campaign',
      reasoning: 'Higher expected ROI',
    },
  }
)

// After verifying the outcome
await protocol.verifyPOIAction(
  poiAction.id,
  node.id,
  true, // success
  { actualReplyRate: 0.27 }
)

// Get rewarded automatically
await protocol.rewardPOIAction(poiAction.id)
```

### 5. Check Your Token Balance

```typescript
const balance = await protocol.getTokenBalance(node.id)
console.log(`Balance: ${balance.balanceMicro / 1000000} AUREV`)
```

### 6. Create a Cognitive Companion

```typescript
import { getSymbiosisFramework } from '@/lib/aurev5/symbiosis-framework'

const symbiosis = getSymbiosisFramework()

// First, register your AI agent node
const aiNode = await protocol.registerNode(
  'ai_agent',
  'agent-smartsend-001',
  { displayName: 'SmartSend AI' }
)

// Create companion
const companion = await symbiosis.createCompanion(
  node.id,
  aiNode.id,
  {
    companionRole: 'collaborator',
    sharedMemoryEnabled: true,
  }
)
```

### 7. Check Civilization Metrics

```typescript
import { getCivilizationMetrics } from '@/lib/aurev5/metrics'

const metrics = getCivilizationMetrics()
const dashboard = await metrics.getDashboardData()

console.log('Total Nodes:', dashboard.summary.totalNodes)
console.log('Progress to 1B:', dashboard.kpis.find(k => k.kpiName === 'global_nodes')?.progressPercent)
```

## 📡 API Endpoints

### Register Node
```bash
POST /api/aurev5/nodes
{
  "nodeType": "human",
  "nodeIdentifier": "user-123",
  "displayName": "John Doe"
}
```

### Submit Consensus Claim
```bash
POST /api/aurev5/consensus
{
  "action": "submit",
  "nodeId": "...",
  "claimType": "insight",
  "claimContent": {"insight": "..."}
}
```

### Record PoI Action
```bash
POST /api/aurev5/poi
{
  "action": "record",
  "nodeId": "...",
  "actionType": "optimize_campaign",
  "actionInput": {...},
  "optimizationScore": 85
}
```

### Get Metrics
```bash
GET /api/aurev5/metrics?action=dashboard
```

## 🎯 Next Steps

1. **Integrate with SmartSend:** Route campaign optimizations through PoI
2. **Create Companion:** Set up personal AI assistant
3. **Join Council:** Participate in collective decision-making
4. **Track Progress:** Monitor civilization KPIs

## 📚 Full Documentation

See `AUREV_PROTOCOL_V5_IMPLEMENTATION.md` for complete architecture and API reference.

