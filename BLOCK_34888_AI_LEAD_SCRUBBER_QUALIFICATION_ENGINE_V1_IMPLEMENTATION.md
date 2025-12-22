# Block 34888 — SmartSend Roofing "AI Lead Scrubber + Qualification Engine" v1

**FULL BLOCK IMPLEMENTATION COMPLETE**

This feature transforms SmartSend from a lead collector into an intelligent lead filter that qualifies homeowners BEFORE contractors waste time.

## ✅ Implementation Summary

### 1. Database Schema ✅
**File:** `supabase/migrations/20250130000001_block34888_ai_lead_scrubber_qualification_engine_v1.sql`

- **`lead_quality` table**: Stores AI-generated quality scores (0-100), lead types, urgency, intent, risk flags, and enrichment data
- **`lead_duplicates` table**: Tracks duplicate lead detection with confidence scores
- **`lead_intake_logs` table**: Logs raw intake data and AI analysis for debugging/auditing
- **RPC Functions**: 
  - `schedule_fast_track_estimate(p_lead_id)` - For hot leads (80-100)
  - `start_strong_followup(p_lead_id)` - For warm leads (60-79)
  - `nurture_sequence(p_lead_id)` - For medium leads (40-59)
  - `mark_low_quality(p_lead_id)` - For low quality leads (0-39)
- **Database Trigger**: Auto-logs new leads for processing

### 2. Edge Functions ✅

#### Lead Scrub (`supabase/functions/lead-scrub/index.ts`)
- Evaluates leads using OpenAI GPT-4o-mini
- Generates quality scores (0-100)
- Classifies lead types (hot, warm, cold, emergency, insurance, retail, bad, etc.)
- Detects risk flags
- Enriches property data (size, value, roof type, storm risk, cost estimates)
- Stores results in `lead_quality` table

#### Lead Routing (`supabase/functions/lead-routing/index.ts`)
- Automatically routes leads based on quality score:
  - **80-100**: Hot leads → Fast-track estimate appointment
  - **60-79**: Warm leads → Strong follow-up sequence
  - **40-59**: Medium leads → Nurture pipeline
  - **0-39**: Low quality → Mark as bad lead

### 3. API Routes ✅

**File:** `src/app/api/leads/[id]/scrub/route.ts`
- `POST /api/leads/[id]/scrub` - Manually trigger lead scrubbing and qualification
- Automatically triggers routing after scrubbing completes

### 4. UI Components ✅

**File:** `src/components/leads/LeadQualityCard.tsx`
- Displays quality score (0-100) with color-coded meter
- Shows lead type, urgency, intent level
- Lists risk flags
- Displays property enrichment data (size, value, roof type, storm risk, cost)
- "Qualify Lead" button to trigger scrubbing
- Integrated into lead detail page

**File:** `src/app/leads/[leadId]/page.tsx`
- Updated to include `LeadQualityCard` component
- Shows qualification data prominently on lead detail view

## 🚀 Deployment Instructions

### 1. Apply Database Migration
```bash
# In Supabase SQL Editor, run:
supabase/migrations/20250130000001_block34888_ai_lead_scrubber_qualification_engine_v1.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Functions

```bash
# Deploy lead-scrub function
supabase functions deploy lead-scrub

# Deploy lead-routing function  
supabase functions deploy lead-routing
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Settings:

**For `lead-scrub` function:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `OPENAI_API_KEY` or `OPENAI_KEY` - OpenAI API key

**For `lead-routing` function:**
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 4. Optional: Set Up Automated Processing

#### Option A: Database Trigger (Already implemented)
The migration includes a trigger that automatically logs new leads for processing when they're inserted.

#### Option B: Cron Job for Batch Processing
You can set up a cron job to process pending intake logs:

```sql
-- In Supabase SQL Editor
SELECT cron.schedule(
  'process-pending-lead-intakes',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/lead-scrub',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := json_build_object(
      'lead_id', l.id,
      'source', 'cron'
    )::text
  ) as request_id
  FROM public.lead_intake_logs l
  WHERE l.processing_status = 'pending'
  LIMIT 10;
  $$
);
```

#### Option C: Trigger from Application
Call the scrub API route whenever a lead is created/imported:

```typescript
// After lead import/creation
await fetch(`/api/leads/${leadId}/scrub`, {
  method: 'POST',
  body: JSON.stringify({ source: 'import' })
});
```

## 📋 Feature Set (v1)

### ✅ Auto-Detect Lead Quality on Intake
- Homeowner verification
- Property ownership check
- Address validation
- Phone number validation
- Roof type support check
- Budget realism assessment
- Service area validation
- Buying intent detection
- Insurance vs retail classification
- Duplicate detection
- Spam detection

### ✅ Lead Type Classification
- Hot Lead (Ready to Buy)
- Warm Lead (Curious / Getting Quotes)
- Cold Lead (Not ready / No urgency)
- Emergency Lead (Leak, storm damage)
- Insurance Lead
- Retail Lead
- Bad Lead (Trash)
- Out of Service Area
- Rental Tenant (no decision power)

### ✅ Smart Data Enrichment
- Property details (sq ft, year built)
- Roofing type guess (based on region)
- Estimated roof size
- Estimated replacement cost range
- Weather/storm history
- Owner name from public data
- Home value
- Storm risk assessment

### ✅ Auto-Route Leads Based on Score
| Score | Action |
|-------|--------|
| 80–100 | Create appointment immediately, notify contractor |
| 60–79 | Send strong follow-up sequence |
| 40–59 | Put in nurture pipeline |
| 0–39 | Mark as low quality, no contractor involvement |

### ✅ Lead Duplicate Detection
- Same email detection
- Same phone detection
- Same property address detection
- Same IP detection
- Same request text detection

### ✅ Lead Risk Flags
- "Address likely a rental property"
- "Phone carrier suggests spam risk"
- "Homeowner shows low buying intent"
- "Budget mismatch for roof type"
- "Outside typical storm radius"

### ✅ Enriched Lead Card
- Homeowner type
- Property details
- Storm history
- Intent level
- Urgency level
- Insurance vs retail
- AI notes
- Risk flags
- Score breakdown

## 🎯 How This Makes Roofers Money

1. **Saves HOURS every day** - Contractor only touches the good leads
2. **Increases close rates** - Hot leads → booked instantly
3. **Eliminates fake/spam leads** - AI catches them before they waste time
4. **Better homeowner info = better proposals** - Roofers know property details instantly
5. **AI does the lead qualification staff normally would do** - But faster and more accurate
6. **SmartSend becomes the first filter in the sales funnel** - Before ANY human gets involved

## 🔧 Usage Examples

### Manual Qualification
```typescript
// Trigger qualification for a specific lead
const response = await fetch(`/api/leads/${leadId}/scrub`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ source: 'manual' })
});
```

### Query Quality Data
```sql
-- Get all hot leads
SELECT l.*, lq.quality_score, lq.lead_type, lq.urgency
FROM leads l
JOIN lead_quality lq ON lq.lead_id = l.id
WHERE lq.quality_score >= 80
ORDER BY lq.quality_score DESC;

-- Get leads with risk flags
SELECT l.*, lq.risk_flags
FROM leads l
JOIN lead_quality lq ON lq.lead_id = l.id
WHERE array_length(lq.risk_flags, 1) > 0;
```

### Filter by Lead Type
```typescript
// In UI, filter leads by type
const { data } = await supabase
  .from('lead_quality')
  .select('*, leads(*)')
  .eq('lead_type', 'hot_lead')
  .gte('quality_score', 80);
```

## 📊 Lead Quality Scoring Logic

The AI evaluates leads on multiple dimensions:

1. **Homeowner Status** (20 points)
   - Confirmed homeowner: +20
   - Likely homeowner: +10
   - Rental tenant: -10
   - Unclear: 0

2. **Property Validation** (15 points)
   - Valid address: +10
   - Property details found: +5
   - Invalid address: -10

3. **Contact Quality** (15 points)
   - Valid phone: +10
   - Valid email: +5
   - Invalid contact info: -15

4. **Buying Intent** (30 points)
   - Ready to buy: +30
   - Shopping: +20
   - Curious: +5
   - Not interested: -20

5. **Urgency** (10 points)
   - Emergency: +10
   - High urgency: +7
   - Medium: +3
   - Low: 0

6. **Service Area** (5 points)
   - In service area: +5
   - Out of area: -15

7. **Risk Factors** (variable deductions)
   - Spam indicators: -30
   - Duplicate: -20
   - Budget mismatch: -10
   - Other flags: variable

**Total Score Range: 0-100**

## 🔄 Next Steps (v2 Enhancements)

- SMS-based qualification conversation
- Real-time duplicate detection on import
- Integration with appointment scheduling system
- Advanced property enrichment APIs
- Custom scoring rules per contractor
- Lead scoring history/trends
- Bulk qualification for imports
- Webhook notifications for hot leads

## 🐛 Troubleshooting

### Leads not being qualified automatically
- Check that the database trigger is enabled
- Verify edge functions are deployed
- Check edge function logs in Supabase dashboard
- Ensure OPENAI_API_KEY is set correctly

### Quality scores seem inaccurate
- Review `lead_intake_logs` table for AI analysis details
- Check OpenAI API usage/quota
- Adjust AI prompt in `lead-scrub/index.ts` if needed

### Routing not working
- Verify RPC functions exist in database
- Check `lead-routing` function logs
- Ensure quality data exists before routing

## 📝 Notes

- The database trigger automatically logs new leads, but doesn't automatically process them
- Manual triggers or cron jobs are needed to actually run qualification
- Consider rate limiting OpenAI API calls to control costs
- Duplicate detection is logged but not automatically merged (can be extended)

---

**Block Status: ✅ COMPLETE**

All core functionality implemented and ready for testing/deployment.
































