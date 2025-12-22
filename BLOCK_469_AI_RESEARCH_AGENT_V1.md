# Block 469 — AI Research Agent v1

## ✅ Implementation Complete

Block 469 implements an AI-powered research agent that automatically analyzes leads' websites, extracts company intelligence, identifies pain points, detects tech stacks and competitors, and generates personalization snippets for use in sequences.

## 📦 What Was Built

### 1. Database Schema

**New Table: `research_cache`**
- Stores AI-generated research data per lead
- Fields:
  - `company_summary` - 2-3 sentence company summary
  - `pain_points` - ICP-matched pain points
  - `tech_stack` - JSONB array of detected technologies
  - `competitors` - JSONB array of detected competitors
  - `personalization_snippets` - JSONB array of AI-generated snippets
  - `industry` - Industry classification
  - `services` - Array of services/products
  - `geographic_info` - Location information
  - `social_proof` - Testimonials, awards, certifications
  - `ai_hooks` - Channel-specific hooks (email, SMS, LinkedIn)
  - `confidence` - Research quality score (0-1)

**Indexes:**
- Fast lookups by lead_id, workspace_id, brand_id
- Time-based queries on updated_at

**RLS Policies:**
- Workspace members can read research data
- Service role can insert/update

### 2. Research Agent Edge Function

**Location:** `/supabase/functions/v1/research-agent/index.ts`

**Capabilities:**
- **Website Scraping** - Light HTML scraping (title, meta, visible text)
- **LLM Analysis** - Uses GPT-4o-mini to extract:
  - Company summary
  - Pain points
  - Industry classification
  - Services/products
  - Geographic information
  - Social proof signals
- **Tech Stack Detection** - Pattern matching for:
  - WordPress, Shopify, Wix
  - HVAC SaaS, Construction Management
  - Booking systems, CRM tools
- **Competitor Detection** - Extracts competitor mentions
- **Personalization Generation** - AI-generated snippets for outreach
- **AI Hooks** - Channel-specific hooks for Email/SMS/LinkedIn

**Triggers:**
- New leads with website/domain/LinkedIn
- Enrichment updates
- Manual API calls

### 3. Personalization Token Support

**New Tokens:**
- `{{company_summary}}` - Company description
- `{{pain_point}}` - Detected pain points
- `{{geo_snippet}}` - Geographic information
- `{{personalization_line}}` - AI-generated personalization snippet
- `{{competitor_reference}}` - Competitor mentions
- `{{tech_stack_note}}` - Tech stack information

**Integration:**
- Updated `getLeadContext()` to include research tokens
- Tokens available in all template rendering contexts
- Works with existing token replacement system

### 4. ICP Scoring Integration

**Function: `apply_research_to_icp_score()`**
- Boosts ICP score based on research findings:
  - Industry match: +5 points
  - Tech stack detected: +3 points
  - Pain points found: +5 points
  - Services detected: +2 points
- Automatically called after research completes

### 5. Router v2 Integration

**Function: `route_lead_with_research()`**
- Enhanced routing that considers research data
- Brand assignment based on:
  - Industry matches
  - Tech stack signals
  - Geographic information
- Automatically re-routes leads after research completes

### 6. Activity Logging

**Function: `log_research_activity()`**
- Logs research completion events
- Tracks:
  - Confidence scores
  - Tech stack counts
  - Competitor counts
  - Snippet counts
- Integrated with `workspace_activity` table

### 7. Auto-Triggers

**Lead Triggers:**
- Automatically triggers research when:
  - Lead created with website/domain/LinkedIn
  - Lead updated with new website/domain/LinkedIn

**Enrichment Triggers:**
- Automatically triggers research when:
  - Enrichment finds website/domain/LinkedIn
  - Enrichment data updated

## 🚀 What This Enables

### For SDRs
- **True Personalization at Scale** - Match top-tier human SDRs
- **Higher Reply Rates** - Hyper-contextual messages
- **Automated Research** - No more manual research

### For Sequences
- **SDR-Level Insight** - AI Copilot can generate better hooks, intros, context
- **Industry-Specific Sequences** - Auto-build ICP-specific templates
- **Multi-Channel Personalization** - Email, SMS, LinkedIn hooks

### For Routing
- **Hyper-Accurate Routing** - Research data affects brand assignment
- **ICP-Based Routing** - Route by industry, tech stack, geography
- **Priority Scoring** - Research boosts ICP scores

### For Predictions
- **Industry-Based Predictions** - Better reply rate predictions
- **Local Market Insights** - Geographic-based predictions

## 📋 Usage Examples

### Manual Research Trigger

```typescript
// Via API
POST /functions/v1/research-agent
{
  "lead_id": "uuid",
  "workspace_id": "uuid", // optional
  "brand_id": "uuid", // optional
  "force": false // optional, force refresh
}
```

### Using Research Tokens in Templates

```markdown
Subject: Quick idea for {{company}}

Hi {{first_name}},

{{personalization_line}}

Saw on your site you specialize in {{pain_point}} — teams like yours often lose 5–7 hrs/week to manual processes.

Your {{tech_stack_note}} setup looks solid. Are you doing scheduling manually?

Best,
{{your_name}}
```

### Checking Research Data

```sql
-- Get research for a lead
SELECT * FROM research_cache WHERE lead_id = 'uuid';

-- Get research tokens
SELECT * FROM get_lead_research('uuid');
```

## 🔄 Integration Points

### With ICP Scoring
- Research automatically boosts ICP scores
- Industry, tech stack, pain points contribute to score

### With Router v2
- Research triggers brand re-routing
- Industry/tech/geo signals affect routing decisions

### With Multi-Brand Manager
- Each brand gets brand-specific research
- Brand-specific personalization
- Brand-specific ICP logic

### With Lead Enrichment
- Enrichment → Research → ICP → Routing → Optimization cycle
- Research uses enrichment data as seeds

### With AI Copilot
- Copilot can inject research tokens automatically
- Better hooks, intros, value props

### With Sequences
- Research tokens available in all sequence steps
- Personalization snippets pre-generated

## 📊 Activity Log Example

```
Research Agent updated lead 498c: detected industry Roofing.
Updated ICP score from 66 → 89.
Generated 5 personalization snippets.
Router reassigned lead to Construction brand.
```

## 🎯 Next Steps (Future Blocks)

This foundation enables:

- **v2: Deep LinkedIn Research** - Analyze LinkedIn profiles
- **v3: Competitor Pricing Intel** - Extract pricing information
- **v4: Employee Count Detection** - Better size estimation
- **v5: Google Review Analysis** - Sentiment analysis
- **v6: AI Browsing** - Browse subpages for deeper research
- **v7: Real-Time Research** - Research per lead per send
- **v8: Autopilot Personalization** - Send-time personalization

## ✅ Block 469 Complete

AI Research Agent v1 is ready for deployment. This transforms SmartSend into an AI-powered research engine that automatically personalizes outreach at scale.



