# Block 18300 — SmartSend Material Detection Engine v1

## Implementation Summary

This block implements a comprehensive Material Detection Engine that reads homeowner messages and photos to identify roofing materials, pitch, layers, age, and compatibility for replacement quotes.

## Features Implemented

### 1. Database Schema ✅

**Migration:** `supabase/migrations/20250130000005_block18300_material_detection_engine_v1.sql`

**Tables Created:**
- `material_intelligence` - Main table storing comprehensive material detection data
- `material_tags` - Tags extracted from detection (material types, components, conditions)
- `material_scores` - Scoring metrics for detection quality
- `material_photos` - Photo-specific material detection results

**Key Fields:**
- Material type detection (asphalt_shingle, metal, tile, flat_tpo, flat_epdm, etc.)
- Shingle type (3_tab, architectural, premium, impact_resistant)
- Metal type (standing_seam, corrugated, ribbed_panel)
- Tile type (clay, concrete, slate_look)
- Pitch estimate (low_slope, medium_slope, steep_slope)
- Layer count (1_layer, 2_layers, uncertain)
- Roof age category (0_5_years, 6_15_years, 16_25_years, 25_plus_years)
- Component detection (skylights, chimney, vents, pipes, satellite mounts, solar panels)
- Condition indicators (granule loss, shingle curl, moss buildup, hail impact, wind uplift)
- Compatibility flags
- Storm vulnerability, insurance angle, replacement urgency
- Confidence scores (text, photo, overall)

### 2. Text-Based Material Detection ✅

**Endpoint:** `POST /api/materials/detect`

**File:** `app/api/materials/detect/route.ts`

**Features:**
- Pattern matching for material types from homeowner messages
- Detects shingle types, metal types, tile types, flat roof types
- Identifies pitch from language clues
- Detects layer count mentions
- Identifies roof age indicators
- Detects components (skylights, chimney, vents, pipes, satellite)
- Identifies condition indicators (granule loss, shingle curl, moss, hail, wind)
- Calculates confidence scores based on clues found
- Stores detection metadata and clues

**Material Patterns Detected:**
- Asphalt: "composition roof", "asphalt shingle", "3-tab", "architectural shingle"
- Metal: "metal roof", "standing seam", "corrugated metal"
- Tile: "tile roof", "clay tile", "spanish tile"
- Flat TPO: "tpo roof", "flat roof"
- Flat EPDM: "epdm roof", "rubber roof"
- Flat Mod Bit: "modified bitumen", "torch down"

### 3. Photo-Based Material Detection ✅

**Endpoint:** `POST /api/materials/photo`

**File:** `app/api/materials/photo/route.ts`

**Features:**
- Uses OpenAI Vision API (GPT-4o) to analyze roof photos
- Detects material type from visual analysis
- Identifies shingle patterns, metal seam spacing, tile shapes
- Detects membrane colors for flat roofs
- Estimates pitch from photo analysis
- Identifies penetrations (skylights, vents, pipes, chimney, satellite)
- Detects condition indicators (moss, granule loss, hail impact, wind uplift)
- Merges photo detection with existing text detection
- Creates material_photos records linking to attachments

### 4. Material Summary API ✅

**Endpoint:** `GET /api/materials/[contactId]`

**File:** `app/api/materials/[contactId]/route.ts`

**Features:**
- Returns comprehensive material summary for a contact
- Includes material intelligence, tags, scores, and photos
- Calculates compatibility flags automatically
- Determines storm vulnerability, insurance angle, replacement urgency
- Formats data for easy consumption by UI components

### 5. Material Summary Panel Component ✅

**File:** `components/contacts/MaterialSummaryPanel.tsx`

**Features:**
- Beautiful card-based UI displaying material intelligence
- Shows material type with badges for subtypes
- Displays pitch, layer count, age estimate, confidence
- Lists detected components and conditions
- Shows risk indicators (storm vulnerability, insurance angle, replacement urgency)
- Displays compatibility flags
- Shows detection sources (text/photo) with icons
- Integrated into contact profile v2 page

### 6. Automatic Task Generation ✅

**Endpoint:** `POST /api/materials/auto-tasks`

**File:** `app/api/materials/auto-tasks/route.ts`

**Features:**
- Generates material-specific tasks based on detected materials
- Asphalt shingle tasks: replacement suggestions, storm inspections, granule loss checks
- Metal roofing tasks: seam checks, hail inspection
- Tile roofing tasks: underlayment checks, cracked tile inspection
- Flat roof tasks: membrane seam checks, TPO cold climate checks, EPDM shrinkage checks
- Condition-based tasks: wind uplift (critical), hail impact (urgent)
- Insurance angle tasks: claim documentation preparation
- Component tasks: skylight age checks
- Automatically creates tasks in smartsend_tasks table

### 7. Background Worker ✅

**Endpoint:** `GET /api/cron/materials/worker`

**File:** `app/api/cron/materials/worker/route.ts`

**Features:**
- Processes contacts with recent messages (last 7 days)
- Automatically detects materials from message text
- Skips contacts that already have material intelligence
- Processes up to 50-100 contacts per run
- Can be scheduled to run periodically (e.g., every hour)

## Integration Points

### Contact Profile Integration ✅

**File:** `app/contacts/[contactId]/v2/page.tsx`

The Material Summary Panel is integrated into the contact profile v2 page in the left sidebar, below the Homeowner Snapshot component.

## Usage Examples

### Detect Materials from Text

```typescript
POST /api/materials/detect
{
  "contactId": "uuid",
  "text": "I have a composition roof with architectural shingles that's about 15 years old. There's some granule loss and I noticed hail damage from last week's storm."
}
```

### Detect Materials from Photo

```typescript
POST /api/materials/photo
{
  "contactId": "uuid",
  "attachmentId": "uuid" // or "imageUrl": "https://..."
}
```

### Get Material Summary

```typescript
GET /api/materials/[contactId]
```

### Generate Material Tasks

```typescript
POST /api/materials/auto-tasks
{
  "contactId": "uuid"
}
```

## Database Functions

### `calculate_material_scores(p_contact_id uuid)`

Calculates and updates material scores based on available intelligence data.

### `sync_material_tags_from_intelligence()`

Trigger function that automatically syncs material tags when intelligence is updated.

### `update_material_overall_confidence()`

Trigger function that calculates overall confidence from text and photo confidence scores.

## Material Detection Categories

### 1. Asphalt Shingles
- 3-tab
- Architectural
- Premium
- Impact-resistant

### 2. Metal Roofing
- Standing seam
- Corrugated
- Ribbed panel

### 3. Tile Roofing
- Clay
- Concrete
- Slate look

### 4. Flat Roofs
- TPO
- EPDM
- Modified Bitumen

### 5. Specialty Components
- Skylights
- Chimney flashing
- Box vents
- Ridge vents
- Pipe boots
- Satellite mounts
- Solar panels

## Material Personalization Examples

The system enables material-specific personalization in emails:

- **Asphalt:** "Architectural shingles in your area were heavily impacted by last week's storm."
- **Metal:** "Metal roofing often hides hail dents — we can inspect it properly."
- **Tile:** "Tile roofs over 20 years often need underlayment refresh."
- **Flat Roof:** "We specialize in TPO inspections for flat homes in your neighborhood."

## Storm Impact by Material

The system adjusts storm severity based on material type:

- **Metal** → Hail dents matter
- **Asphalt** → Granule loss
- **Tile** → Cracks
- **TPO** → Seam lifts
- **EPDM** → Shrinkage

## Why Roofers Will Love This

🔥 **1. They know EXACTLY what they're walking into**
- Saves time on appointments
- No surprises on job day

🔥 **2. Material personalization feels premium**
- They feel like pros
- Better customer communication

🔥 **3. Photos get analyzed automatically**
- Massive time saver
- Pre-visit diagnosis

🔥 **4. Better estimates**
- Material-specific cost considerations
- Layer count awareness

🔥 **5. Faster insurance conversations**
- Material matters for coverage
- Strong insurance angles identified

## Why YOU Will Love This

🔥 **1. This feature SELLS SmartSend alone**
- Roofers have NEVER seen this capability
- Unique competitive advantage

🔥 **2. Huge competitive edge**
- No cold email tool can read roofs
- AI-powered material intelligence

🔥 **3. High shareability**
- Roofers will brag about this feature
- Word-of-mouth marketing

## Next Steps / Future Enhancements

1. **Pitch Estimation Worker** - Dedicated worker for pitch estimation from photos
2. **Material Personalization in Emails** - Auto-customize email content based on detected materials
3. **Material-Based Campaign Filtering** - Filter campaigns by material type
4. **Material Analytics Dashboard** - Show material distribution across contacts
5. **Enhanced Photo Analysis** - More detailed pattern recognition
6. **Material Compatibility Warnings** - Real-time compatibility checks
7. **Material Cost Estimation** - Rough cost estimates based on material type and square footage

## Environment Variables Required

- `OPENAI_API_KEY` - Required for photo-based material detection using GPT-4o Vision

## Cron Job Setup

Set up a cron job to run the material detection worker periodically:

```bash
# Run every hour
0 * * * * curl -H "X-Cron-Secret: YOUR_SECRET" https://your-domain.com/api/cron/materials/worker
```

## Testing

1. **Test Text Detection:**
   - Send a message mentioning "composition roof" or "architectural shingles"
   - Call `/api/materials/detect` with the message text
   - Verify material intelligence is created

2. **Test Photo Detection:**
   - Upload a roof photo to a contact
   - Call `/api/materials/photo` with the attachment ID
   - Verify photo analysis is stored

3. **Test Material Summary:**
   - Visit contact profile page
   - Verify Material Summary Panel displays correctly
   - Check all detected materials and components

4. **Test Task Generation:**
   - Call `/api/materials/auto-tasks` for a contact with material intelligence
   - Verify material-specific tasks are created

## Files Created/Modified

### New Files:
- `supabase/migrations/20250130000005_block18300_material_detection_engine_v1.sql`
- `app/api/materials/detect/route.ts`
- `app/api/materials/photo/route.ts`
- `app/api/materials/[contactId]/route.ts`
- `app/api/materials/auto-tasks/route.ts`
- `app/api/cron/materials/worker/route.ts`
- `components/contacts/MaterialSummaryPanel.tsx`

### Modified Files:
- `app/contacts/[contactId]/v2/page.tsx` - Added Material Summary Panel

## Notes

- Material detection works best with clear text mentions or high-quality photos
- Confidence scores help roofers understand detection reliability
- Automatic task generation saves time by creating material-specific follow-ups
- The system gracefully handles missing data (shows "unknown" rather than errors)
- Photo analysis requires OpenAI API key; falls back gracefully if not configured





















































