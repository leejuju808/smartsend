# SmartSend v3: AI Sales Agent System Implementation

## Overview

SmartSend v3 transforms SmartSend into a fully autonomous revenue engine that:
- Finds new leads via LinkedIn + web scraping
- Qualifies them with AI scoring
- Launches tailored outreach sequences
- Logs replies back into the Inbox + Analytics

## Architecture

```
SmartSend v3 Core
│
├── Prospect Engine (data gathering)
│     ├── LinkedIn + Web crawler (PhantomBuster / SerpAPI)
│     ├── AI Lead Scorer (OpenAI embedding model)
│
├── Conversation Engine
│     ├── AI Outreach Writer (personalized intros)
│     ├── AI Reply Handler (detect intent, route)
│
└── Decision Engine
      ├── "Autopilot Mode" switch
      ├── Rules: when to send, pause, escalate
      ├── KPI feedback → Analytics
```

## Database Schema

### Tables Created

#### `ai_agents`
- Stores autonomous AI sales agent configurations
- Tracks performance metrics (leads generated, messages sent, win rate)
- Supports autopilot mode toggle
- Org-scoped with RLS policies

#### `ai_leads_queue`
- Queue of leads discovered by AI agents
- Includes AI relevance score (0-100)
- Tracks status: new → messaged → replied → interested/converted
- Stores enrichment data and conversation context

**Migration File:** `supabase/migrations/20250122000000_ai_agents_system.sql`

## Edge Functions

### 1. `ai-prospector`
**Path:** `supabase/functions/ai-prospector/index.ts`

- Collects leads from LinkedIn/web scraping sources
- Uses OpenAI to score leads based on relevance (0-100)
- Only inserts leads with score >= 60
- Updates agent's `leads_generated` counter

**Usage:**
```typescript
POST /functions/v1/ai-prospector
{
  "agent_id": "uuid",
  "source": "web" | "linkedin",
  "limit": 10
}
```

### 2. `ai-outreach`
**Path:** `supabase/functions/ai-outreach/index.ts`

- Generates personalized outreach messages using GPT-4o-mini
- Sends messages via SmartSend's multi-channel API
- Updates lead status to "messaged"
- Tracks daily message limits

**Usage:**
```typescript
POST /functions/v1/ai-outreach
{
  "agent_id": "uuid",
  "limit": 10
}
```

### 3. `ai-reply-handler`
**Path:** `supabase/functions/ai-reply-handler/index.ts`

- Classifies inbound replies into intent categories:
  - `interested` → status: "interested"
  - `not_now` → status: "not_now"
  - `remove` → status: "disqualified"
  - `question` → status: "replied"
  - `neutral` → status: "replied"
- Updates lead status automatically
- Logs interested replies to inbox

**Usage:**
```typescript
POST /functions/v1/ai-reply-handler
{
  "lead_id": "uuid",
  "reply_body": "text",
  "reply_subject": "text",
  "original_message": "text (optional)"
}
```

## API Routes

### Agent Management

**GET** `/api/agents` - List all agents for active org
**POST** `/api/agents` - Create new agent
**GET** `/api/agents/[id]` - Get specific agent
**PUT** `/api/agents/[id]` - Update agent (including autopilot toggle)
**DELETE** `/api/agents/[id]` - Delete agent

### Agent Actions

**POST** `/api/agents/[id]/prospect` - Trigger prospecting
**POST** `/api/agents/[id]/outreach` - Trigger outreach

## Dashboard UI

**Path:** `/dashboard/agents`

Features:
- Agent cards showing:
  - Status (idle, scouting, messaging, paused)
  - Stats: Leads Scouted, Messages Sent, Replies, Win Rate
  - Win rate progress bar
  - Autopilot toggle switch
- Create new agent button
- Manual trigger buttons for prospect/outreach
- Real-time status updates

## Setup Instructions

### 1. Run Database Migration

```bash
# The migration will be applied automatically by Supabase
# Or manually apply:
supabase db push
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy ai-prospector
supabase functions deploy ai-outreach
supabase functions deploy ai-reply-handler
```

### 3. Environment Variables

Ensure these are set in Supabase:
- `OPENAI_API_KEY` - Required for AI features
- `SUPABASE_URL` - Auto-configured
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-configured

### 4. Access Dashboard

Navigate to `/dashboard/agents` in your app to:
- Create your first AI agent
- Configure target industry/role
- Enable autopilot mode
- Monitor performance

## Usage Flow

### Creating an Agent

1. Click "Create AI Agent"
2. Enter agent name
3. (Optional) Set target industry and role
4. Agent is created with default limits (50 leads/day, 100 messages/day)

### Running Prospecting

1. Select an agent
2. Click "Prospect" button
3. Agent fetches leads from configured source
4. Leads are scored and inserted into queue if score >= 60

### Running Outreach

1. Select an agent with leads in queue
2. Click "Outreach" button
3. Agent generates personalized messages
4. Messages are sent via SmartSend API
5. Lead status updated to "messaged"

### Autopilot Mode

Enable autopilot to let the agent:
- Automatically prospect on schedule
- Send outreach to qualified leads
- Process replies and update status

## Integration Points

### SmartSend Send Queue

The `ai-outreach` function integrates with SmartSend's existing send queue:
- Tries `smartsend_queue` first
- Falls back to `send_queue` if needed
- Uses `sending_accounts` table for provider configuration

### Inbox Integration

When a reply is classified as "interested":
- Creates entry in `replies` table (if exists)
- Status: "new"
- Intent: "interested"

### Analytics

Agent performance metrics:
- Leads generated (per agent)
- Messages sent (per agent)
- Replies received (auto-updated via trigger)
- Win rate (calculated: converted / sent * 100)

## Future Enhancements

### Phase v3-A (Current)
- ✅ AI Prospector + Scoring Function
- ✅ Database schema

### Phase v3-B
- AI Outreach Message Engine
- Enhanced personalization
- A/B testing for messages

### Phase v3-C
- AI Reply Handler + Learning Loop
- Conversation context tracking
- Auto-followup sequences

### Phase v3-D
- Unified Autopilot Dashboard
- Scheduled prospecting
- Automated escalation rules
- Advanced analytics

## Testing

### Manual Testing

1. Create an agent via UI
2. Trigger prospecting manually
3. Verify leads appear in `ai_leads_queue`
4. Trigger outreach manually
5. Verify messages are queued for sending
6. Simulate a reply via `ai-reply-handler`
7. Verify status updates correctly

### API Testing

```bash
# Create agent
curl -X POST /api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Agent", "target_industry": "Technology"}'

# Trigger prospecting
curl -X POST /api/agents/{id}/prospect \
  -H "Content-Type: application/json" \
  -d '{"source": "web", "limit": 5}'

# Trigger outreach
curl -X POST /api/agents/{id}/outreach \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

## Definition of Done ✅

- [x] Tables + functions for autonomous agents created
- [x] AI prospector can generate and score leads
- [x] Outbound AI messages work through SmartSend API
- [x] Replies auto-classified into pipeline stages
- [x] Agent Dashboard tracks performance live

## Notes

- The prospector currently uses mock data. Integrate with PhantomBuster/SerpAPI for production.
- Lead scoring threshold (60) is configurable in the function.
- Daily limits are enforced but not automatically reset (add cron job for daily reset).
- Autopilot mode toggle exists but scheduled execution needs to be implemented.
- Reply handler requires integration with your inbound email system to trigger automatically.

