# BLOCK 26590 — SmartSend Roofing Lead Timeline AI Insights v1

## Implementation Summary

This block upgrades SmartSend from a "lead tracker" into a sales intelligence engine by automatically generating AI-powered insights for every roofing lead.

## What Was Implemented

### 1. Database Schema ✅
- **Migration**: `supabase/migrations/20250220000000_block_26590_roofing_lead_ai_insights_v1.sql`
- Created `roofing_lead_ai_insights` table with fields:
  - `summary` - 2-4 sentence summary of the lead
  - `buying_intent` - High/Medium/Low with reason
  - `intent_score` - 0-100 score
  - `objections` - Detected objections (price, timeline, insurance, etc.)
  - `recommended_angle` - Best sales angle recommendation
  - `next_action` - Recommended next action
- Added indexes for performance
- Configured RLS policies for security
- Added trigger for `updated_at` timestamp
- Added unique constraint on `lead_id` for upsert operations
- **Added auto-triggering** via database triggers:
  - Triggers on `transcript_messages` INSERT (new homeowner/estimator messages)
  - Triggers on `unified_messages` INSERT (new inbound messages)
  - Triggers on `leads` UPDATE (when source assigned, score updated, or status changes)

### 2. Edge Function ✅
- **File**: `supabase/functions/lead_ai_insights/index.ts`
- Generates AI insights using OpenAI GPT-4o-mini
- Pulls conversation context from:
  - `transcript_messages` (primary)
  - `unified_messages` (fallback)
  - `reply_threads` (fallback)
- Analyzes conversation and extracts:
  - Summary with context, pain points, key phrases, urgency
  - Buying intent classification with score
  - Objection detection
  - Sales angle recommendation
  - Next action suggestion
- Stores insights in database via upsert

### 3. API Routes ✅
- **GET** `/api/leads/[id]/ai-insights` - Fetch existing insights
- **POST** `/api/leads/[id]/ai-insights/generate` - Generate new insights

### 4. UI Component ✅
- **File**: `app/leads/[id]/components/AiInsightsCard.tsx`
- Beautiful card displaying:
  - AI summary
  - Buying intent with color coding (green/yellow/red)
  - Intent score (0-100)
  - Next action recommendation
  - Objections detected (if any)
  - Best sales angle
- Manual refresh button to regenerate insights
- Loading and empty states

### 5. Integration ✅
- Integrated into `app/leads/[id]/TimelineTab.tsx`
- Displays at the TOP of the Lead Timeline page
- Sits above the Activity Feed

## Features Delivered

1. ✅ **AI Summary of Lead** - Context, pain points, key phrases, urgency
2. ✅ **Buying Intent Score & Reason** - High/Medium/Low with explanation
3. ✅ **Objection Detection** - Price resistance, timeline issues, insurance confusion, hesitation
4. ✅ **Sales Angle Recommendation** - Exact guidance on how to respond
5. ✅ **Next Action Suggestion** - Call, send estimate, follow-up, nurture, etc.

## How It Works

### Automatic Generation (Recommended)
1. When a new message arrives or lead data changes, database triggers automatically call the edge function
2. Edge function pulls all conversation messages from `transcript_messages` (or fallback to `unified_messages`)
3. OpenAI analyzes the conversation and generates insights
4. Insights are stored in database via upsert (one insight record per lead)
5. When user views the lead timeline, insights are automatically displayed

### Manual Generation (Fallback)
1. User navigates to a lead's timeline page
2. AI Insights card loads existing insights (if available)
3. If no insights exist, user can click "Generate Insights"
4. Same process as automatic generation, but triggered manually
5. User can refresh insights anytime with the refresh button

## Auto-Triggering ✅

**IMPLEMENTED** - Insights are automatically generated when:
- ✅ New message from lead (via `transcript_messages` INSERT)
- ✅ New inbound message (via `unified_messages` INSERT with `direction = 'inbound'`)
- ✅ Lead source assigned (via `leads` UPDATE when `source` changes)
- ✅ Lead score updated (via `leads` UPDATE when `hot_lead_score` changes)
- ✅ Lead status changes (via `leads` UPDATE when `status` changes)

The triggers use `pg_net` extension to call the edge function asynchronously (fire-and-forget), so they don't block the original operation. Errors are logged but don't fail the insert/update.

## Environment Variables Required

- `OPENAI_API_KEY` - OpenAI API key for GPT-4o-mini
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for edge function

## Testing

1. Navigate to any lead's timeline page (`/leads/[id]`)
2. Verify AI Insights card appears at the top
3. Click "Generate Insights" if no insights exist
4. Verify insights are displayed correctly
5. Click refresh button to regenerate insights
6. Verify insights update correctly

## Impact

This feature gives roofers an **UNFAIR ADVANTAGE** by:
- Stopping missed buying signals
- Eliminating need to scroll through messages
- Providing perfect response guidance
- Making new salespeople 10× better instantly
- Creating a "WOW" moment during demos

## Files Created/Modified

### Created:
- `supabase/migrations/20250220000000_block_26590_roofing_lead_ai_insights_v1.sql`
- `supabase/functions/lead_ai_insights/index.ts`
- `app/api/leads/[id]/ai-insights/route.ts`
- `app/api/leads/[id]/ai-insights/generate/route.ts`
- `app/leads/[id]/components/AiInsightsCard.tsx`

### Modified:
- `app/leads/[id]/TimelineTab.tsx` - Added AiInsightsCard import and component

## Next Steps

1. ✅ Deploy migration to production (includes auto-triggers)
2. ✅ Deploy edge function
3. Test with real leads (verify auto-triggering works)
4. Monitor OpenAI API usage and costs
5. Consider adding rate limiting to prevent excessive API calls
6. Gather user feedback and iterate
7. Consider adding caching/throttling for frequently updated leads
