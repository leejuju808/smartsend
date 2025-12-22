# Smart Automation Rules (IFTTT Engine) Implementation

This document describes the implementation of the Smart Automation Rules system, a powerful IFTTT-style automation engine that automatically triggers actions based on email events, lead scores, and time conditions.

## 🎯 Overview

The automation system allows users to create rules that automatically:
- Tag contacts based on their behavior
- Assign leads to sales team members
- Enroll prospects in follow-up sequences
- Suppress emails from unengaged contacts
- Pause campaigns when prospects reply
- And much more...

## 🏗️ Architecture

### Core Components

1. **Database Tables**
   - `automation_rules` - Stores rule definitions and conditions
   - `automation_actions` - Stores actions to execute when rules fire

2. **Rule Engine** (`/lib/automation/engine.ts`)
   - Evaluates rules against context
   - Determines when rules should fire

3. **Action Executor** (`/lib/automation/actions.ts`)
   - Executes automation actions
   - Handles errors gracefully

4. **API Endpoints**
   - `/api/automation/rules` - CRUD operations for rules
   - `/api/automation/run` - Executes automation based on triggers

5. **UI Dashboard** (`/dashboard/automation`)
   - Rule creation and management interface
   - Real-time rule status and history

## 🗄️ Database Schema

### automation_rules Table
```sql
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  is_enabled boolean default true,
  trigger_type text not null check (trigger_type in ('event', 'score', 'time')),
  event_type text check (event_type in ('open', 'click', 'reply', 'bounce')),
  condition_json jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### automation_actions Table
```sql
create table public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.automation_rules(id) on delete cascade,
  action_type text not null check (action_type in ('tag', 'assign', 'enroll_sequence', 'suppress', 'pause_campaign')),
  action_payload jsonb default '{}',
  created_at timestamptz default now()
);
```

## 🔧 Rule Types

### 1. Event-Based Triggers
Trigger when specific email events occur:
- **Open**: Email is opened
- **Click**: Link is clicked (with optional URL filtering)
- **Reply**: Prospect replies to email
- **Bounce**: Email bounces

**Example Conditions:**
```json
{
  "contains_url": "pricing",
  "email_domain": "gmail.com",
  "campaign_id": "uuid-here"
}
```

### 2. Score-Based Triggers
Trigger when lead scores meet thresholds:
- **Min Score**: Trigger when score ≥ X
- **Max Score**: Trigger when score ≤ X

**Example Conditions:**
```json
{
  "min_score": 50,
  "max_score": 100
}
```

### 3. Time-Based Triggers
Trigger at specific times (future enhancement):
- **Time of Day**: Between specific hours
- **Day of Week**: On specific days

## 🚀 Available Actions

### Tag Contact
```json
{
  "action_type": "tag",
  "action_payload": { "tag": "hot_lead" }
}
```

### Assign Thread
```json
{
  "action_type": "assign",
  "action_payload": { "user_id": "sales-rep-uuid" }
}
```

### Enroll in Sequence
```json
{
  "action_type": "enroll_sequence",
  "action_payload": { "sequence_id": "follow-up-sequence-uuid" }
}
```

### Suppress Email
```json
{
  "action_type": "suppress",
  "action_payload": {}
}
```

### Pause Campaign
```json
{
  "action_type": "pause_campaign",
  "action_payload": {}
}
```

### Increment Score
```json
{
  "action_type": "increment_score",
  "action_payload": { "points": 10 }
}
```

### Send Follow-up
```json
{
  "action_type": "send_followup",
  "action_payload": { "campaign_id": "follow-up-campaign-uuid" }
}
```

## 🔌 Integration Points

### 1. Open Tracking
Automatically triggers when tracking pixels load:
```typescript
// In /t/o/[cid]/[email]/route.ts
await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/automation/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    email: decodeURIComponent(email), 
    campaign_id: cid, 
    event_type: "open" 
  })
});
```

### 2. Click Tracking
Automatically triggers when links are clicked:
```typescript
// In /t/c/[cid]/[email]/route.ts
await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/automation/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    email: decodeURIComponent(params.email), 
    campaign_id: params.cid, 
    event_type: "click",
    url 
  })
});
```

### 3. Reply Webhook
Automatically triggers when prospects reply:
```typescript
// In /api/inbound/reply/route.ts
await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/automation/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    email, 
    campaign_id, 
    event_type: "reply" 
  })
});
```

### 4. Lead Score Changes
Automatically triggers when scores are updated:
```typescript
// Call this after updating lead scores
await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/automation/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ 
    email, 
    lead_score: newScore 
  })
});
```

## 🧪 Testing

### Run the Test Suite
```bash
# Test the automation system
npx tsx scripts/test-automation.ts
```

### Manual Testing
1. **Create a Rule**: Go to `/dashboard/automation` and create a test rule
2. **Trigger Events**: Send emails, track opens/clicks, or update lead scores
3. **Verify Actions**: Check that the expected actions were executed

### Test Scenarios
- **Hot Lead Rule**: Click pricing link → Tag as "hot_lead" + Enroll in sequence
- **High Score Rule**: Score ≥ 50 → Assign to sales rep
- **Reply Rule**: Reply received → Pause campaign + Suppress email

## 📊 Performance Considerations

### Indexing
- Rules are indexed by `(is_enabled, trigger_type, event_type)`
- Actions are indexed by `rule_id`
- Workspace filtering for multi-tenant isolation

### Execution
- Rules are evaluated in parallel for performance
- Failed actions don't block other actions
- Comprehensive error logging and monitoring

### Scalability
- Rules are cached in memory for fast evaluation
- Batch processing for high-volume scenarios
- Rate limiting to prevent abuse

## 🔒 Security & Privacy

### Row-Level Security (RLS)
- Users can only access rules for their workspace
- Actions are scoped to user permissions
- Audit logging for compliance

### Data Validation
- Input sanitization for all rule conditions
- Action payload validation
- SQL injection prevention

## 🚀 Future Enhancements

### Planned Features
1. **Time-Based Triggers**: Cron-based automation
2. **Advanced Conditions**: Complex boolean logic, regex matching
3. **Action Chaining**: Multi-step automation workflows
4. **A/B Testing**: Rule performance optimization
5. **Analytics**: Rule effectiveness metrics
6. **Templates**: Pre-built automation templates

### Integration Opportunities
1. **CRM Systems**: Salesforce, HubSpot automation
2. **Slack/Teams**: Notifications and alerts
3. **Calendar**: Meeting scheduling automation
4. **Webhooks**: External system integration

## 📚 API Reference

### Create Rule
```http
POST /api/automation/rules
Content-Type: application/json

{
  "name": "Hot Lead Follow-up",
  "trigger_type": "event",
  "event_type": "click",
  "condition_json": { "contains_url": "pricing" },
  "actions": [
    { "action_type": "tag", "action_payload": { "tag": "hot_lead" } }
  ]
}
```

### Execute Automation
```http
POST /api/automation/run
Content-Type: application/json

{
  "email": "prospect@example.com",
  "campaign_id": "campaign-uuid",
  "event_type": "click",
  "url": "https://example.com/pricing"
}
```

### Get Rules
```http
GET /api/automation/rules
```

### Update Rule
```http
PUT /api/automation/rules
Content-Type: application/json

{
  "id": "rule-uuid",
  "is_enabled": false
}
```

### Delete Rule
```http
DELETE /api/automation/rules?id=rule-uuid
```

## 🎉 Success Metrics

The automation system is designed to deliver:
- **Faster Response Times**: Instant lead qualification and routing
- **Higher Conversion Rates**: Automated follow-up sequences
- **Better Lead Quality**: Smart scoring and tagging
- **Reduced Manual Work**: Automated repetitive tasks
- **Improved Customer Experience**: Personalized, timely interactions

## 🤝 Contributing

When adding new automation features:
1. **Add Database Migration**: Update schema if needed
2. **Extend Rule Engine**: Add new trigger types or conditions
3. **Implement Actions**: Create new action types
4. **Update UI**: Add form fields for new features
5. **Write Tests**: Ensure reliability and performance
6. **Update Documentation**: Keep this guide current

---

*This automation system transforms SmartSend from a simple email tool into a sophisticated lead management platform, automatically nurturing prospects and maximizing conversion opportunities.* 