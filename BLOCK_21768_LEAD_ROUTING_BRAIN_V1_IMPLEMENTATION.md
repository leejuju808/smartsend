# Block 21768 — SmartSend Roofing Lead Routing Brain v1 Implementation

## ✅ Implementation Complete

This document summarizes the implementation of Block 21768 - SmartSend Roofing Lead Routing Brain v1, which automatically assigns every new lead to the best estimator based on availability, performance score, workload balance, job type, and service area matching.

## 📦 What Was Implemented

### 1. Database Schema (`supabase/migrations/20250130000019_block_21768_lead_routing_brain_v1.sql`)

#### Tables Created:

1. **`estimator_availability`** - Tracks real-time availability status
   - `estimator_id` - References profiles(id)
   - `workspace_id` - References workspaces(id)
   - `is_available` - Boolean availability flag
   - `updated_at` - Timestamp tracking
   - Unique constraint: one record per estimator per workspace

2. **`estimator_zones`** - Maps estimators to service areas (zip codes)
   - `estimator_id` - References profiles(id)
   - `workspace_id` - References workspaces(id)
   - `zipcode` - Service area zip code
   - Unique constraint: one record per estimator+zipcode combination

3. **`lead_routing_log`** - Logs every routing decision with full reasoning
   - `lead_id` - References leads(id)
   - `estimator_id` - References profiles(id)
   - `workspace_id` - References workspaces(id)
   - `reasoning` - JSONB field storing full routing logic
   - `created_at` - Timestamp of routing decision

#### Schema Updates:

- Added `estimator_id` column to `leads` table (if it doesn't exist)
- Created indexes for performance on all new tables
- Implemented RLS policies for workspace-scoped access

### 2. Edge Function (`supabase/functions/route-lead/index.ts`)

**Purpose**: Automatically route leads to the best available estimator

**Input**:
```typescript
{
  lead_id: string;
  zipcode?: string;
  job_type?: string; // 'insurance' | 'retail'
  workspace_id: string;
}
```

**Output**:
```typescript
{
  assigned_to: string; // estimator_id
  reasoning: {
    zipcode?: string;
    job_type?: string;
    weights: Array<{
      estimator_id: string;
      is_available: boolean;
      score: number;
      final_weight: number;
      zone_match?: boolean;
    }>;
    chosen: {
      estimator_id: string;
      final_weight: number;
    };
  };
}
```

**Routing Rules**:

1. **Availability First** - Available estimators get 1.0x multiplier, offline get 0.5x
2. **Performance Weight** - Based on estimator scorecard letter grade:
   - A → 1.0 (90% priority)
   - B → 0.8 (70% priority)
   - C → 0.6 (50% priority)
   - D → 0.4 (30% priority)
   - F → 0.2
3. **Workload Balancing** - Penalizes estimators with more assigned leads (max 20% penalty)
4. **Zone Matching** - 20% bonus if lead zipcode matches estimator's service area
5. **Job Type Matching** - Insurance jobs get 15% bonus for high performers (score ≥ 0.8)

**Final Weight Formula**:
```
final_weight = (availability_multiplier) × (performance_score) × (workload_penalty) × (zone_bonus) × (job_type_bonus)
```

### 3. UI Component (`components/leads/RoutingLog.tsx`)

**Purpose**: Display routing decision transparency to owners

**Features**:
- Shows assigned estimator
- Displays zipcode and job type (if provided)
- Lists all estimator candidates with their weights
- Highlights the chosen estimator
- Shows availability status and zone matches
- Displays performance scores

**Usage**:
```tsx
import { RoutingLog } from "@/components/leads/RoutingLog";

<RoutingLog 
  log={routingLogData} 
  estimatorName="John Doe" // Optional
/>
```

## 🚀 How to Use

### Step 1: Apply Database Migration

Run the migration in Supabase SQL Editor:
```bash
supabase/migrations/20250130000019_block_21768_lead_routing_brain_v1.sql
```

### Step 2: Deploy Edge Function

```bash
cd supabase/functions/route-lead
supabase functions deploy route-lead
```

Set environment variables in Supabase Dashboard:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Set Estimator Availability

When an estimator comes online/offline, update their availability:

```typescript
await supabase
  .from("estimator_availability")
  .upsert({
    estimator_id: "uuid",
    workspace_id: "uuid",
    is_available: true, // or false
  }, {
    onConflict: "estimator_id,workspace_id"
  });
```

### Step 4: Configure Estimator Zones (Optional)

Assign zip codes to estimators:

```typescript
await supabase
  .from("estimator_zones")
  .insert({
    estimator_id: "uuid",
    workspace_id: "uuid",
    zipcode: "12345",
  });
```

### Step 5: Route a Lead

Call the edge function when a new lead is created:

```typescript
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/route-lead`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      lead_id: "lead-uuid",
      zipcode: "12345", // Optional
      job_type: "insurance", // Optional: 'insurance' | 'retail'
      workspace_id: "workspace-uuid",
    }),
  }
);

const result = await response.json();
// result.assigned_to contains the estimator_id
```

### Step 6: Display Routing Log

Fetch and display the routing log for a lead:

```typescript
const { data: routingLog } = await supabase
  .from("lead_routing_log")
  .select("*")
  .eq("lead_id", leadId)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

// Then render:
<RoutingLog log={routingLog} />
```

## 🔄 Integration Points

### Automatic Routing on Lead Creation

Add a database trigger or call the edge function in your lead creation flow:

```sql
-- Example: Call edge function via pg_net or webhook
-- Or handle in application code after lead insert
```

Or in your application code:

```typescript
// After creating a lead
const { data: lead } = await supabase
  .from("leads")
  .insert({ ... })
  .select()
  .single();

// Route the lead
await routeLead({
  lead_id: lead.id,
  zipcode: lead.zipcode,
  job_type: lead.job_type,
  workspace_id: lead.workspace_id,
});
```

### Display in Lead Detail Page

Add the routing log component to your lead detail view:

```tsx
// In your lead detail page component
const { data: routingLog } = await supabase
  .from("lead_routing_log")
  .select("*")
  .eq("lead_id", leadId)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

return (
  <div>
    {/* Other lead details */}
    {routingLog && <RoutingLog log={routingLog} />}
  </div>
);
```

## 📊 Real Money Impact

This feature provides direct revenue impact:

✅ **Hot leads get answered faster** - No more lost $10K–$20K jobs due to slow response  
✅ **Best closer gets high-value homeowners** - Maximizes job win percentage  
✅ **Owners don't need to manually assign** - Saves hours per week  
✅ **Transparent logs build trust** - Owners see why SmartSend chose someone  
✅ **Workload balancing prevents burnout** - Distributes leads evenly  

## 🔧 Configuration

### Adjusting Routing Weights

Edit `supabase/functions/route-lead/index.ts` to adjust:
- Availability multipliers (currently 1.0 vs 0.5)
- Performance score weights (A=1.0, B=0.8, etc.)
- Workload penalty percentage (currently max 20%)
- Zone match bonus (currently 20%)
- Job type bonus (currently 15% for insurance)

### Adding Custom Rules

Extend the routing logic in the edge function to add:
- Time-of-day preferences
- Estimator skill matching (metal, tile, etc.)
- Lead value-based routing
- Custom company rules

## 📝 Notes

- The system uses `contractor_roles` table to identify estimators (sales_rep, storm_rep, insurance_specialist)
- Falls back to all workspace members if no contractor_roles exist
- Requires estimator_scorecards to be computed for performance-based routing
- Zone matching is optional but recommended for geographic routing
- All routing decisions are logged for transparency and debugging

## 🐛 Troubleshooting

**No estimators found**: Ensure contractor_roles exist or workspace has members

**Leads not routing**: Check edge function logs, verify SUPABASE_URL and service role key

**Wrong estimator chosen**: Review routing log reasoning, check availability and scorecard data

**Performance issues**: Ensure indexes are created on estimator_availability, estimator_zones, and lead_routing_log tables









































