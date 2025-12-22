# Block 18500 — SmartSend Photo Intelligence v1 Implementation

## 🎯 Overview

SmartSend Photo Intelligence v1 is a comprehensive AI-powered photo analysis system that extracts critical roofing details from homeowner photos instantly—before the roofer even shows up. This transforms SmartSend from an email tool into a real roofing assistant.

## ✅ Features Implemented

### 1. Photo Intelligence Categories (v1)

Every image uploaded triggers detection for:

#### 1️⃣ Storm Damage Detection
- Hail bruising
- Circular impact marks
- Granule loss patches
- Wind-torn shingles
- Loose shingles
- Uplifted shingle edges
- **Storm Opportunity Score** (0-100)

#### 2️⃣ Leak & Water Intrusion Detection
- Ceiling stains
- Brown water rings
- Yellow discoloration
- Bubbling paint
- Sagging drywall
- Mold patterns
- **Emergency flagging** for leaks

#### 3️⃣ Material Detection
- Asphalt shingles (3-tab, architectural, premium, impact-resistant)
- Metal (standing seam, corrugated, ribbed panel)
- Tile (clay, concrete, slate-look)
- Flat roofs (TPO, EPDM, modified bitumen)
- Skylight types
- Vent types
- Chimney configuration
- **Syncs with Material Engine (Block 18300)**

#### 4️⃣ Condition & Wear Detection
- Granule loss
- Cracking
- Curling
- Blistering
- Algae/moss
- Nail pops
- Exposed underlayment
- **Roof age estimation**

#### 5️⃣ Gutter / Flashing Damage
- Bent gutters
- Sagging gutters
- Pulled-back flashings
- Damaged drip edge

#### 6️⃣ Interior Indicators
- Wall stains
- Ceiling cracks
- Mold colonies
- Active leak path
- Insulation moisture
- **Automatic labeling: Interior Leak Evidence**

### 2. Damage Severity Score (0-100)

SmartSend assigns a severity score:
- **80-100** = Major Damage (Insurance Strong)
- **60-79** = Moderate Damage (Likely Insurance)
- **40-59** = Minor Damage (Possible Repair)
- **0-39** = Cosmetic / Uncertain

Severity affects:
- Recommended next action
- Pipeline movement
- Likelihood of insurance claim
- Urgency

### 3. Insurance Indicators (v1)

Photo-based cues for insurance claims:
- Hail bruising pattern
- Shingle fractures
- Broken tiles
- Dented metal vents
- Compromised ridge caps
- Interior water damage
- Mold formations

**If 2+ indicators exist:**
- Label: **Insurance Strong Candidate**
- Option to move to Insurance Pipeline

### 4. SmartSend Photo Summary (Contact Profile)

Every contact gets a new Photo Intelligence panel with:
- Detected damage types
- Material type
- Pitch guess
- Severity score
- Insurance likelihood
- Repair urgency
- Replacement recommendation
- Recommended task
- Recommended appointment slot

**Example:**
```
Damage: Wind uplift + missing shingles
Material: 30-Year Architectural
Severity: 76 (Moderate)
Insurance Probability: High
Urgency: Within 48 hours
Recommended Action: Offer 2 appointment times for tomorrow
```

### 5. Auto-Tasks Triggered by Photos

Depending on detection:

**Leak Photo Tasks:**
- Contact homeowner immediately
- Offer emergency slot
- Ask for exterior photos

**Storm Damage Tasks:**
- Send storm inspection message
- Add to insurance pipeline

**Material Tasks:**
- Bring correct ladder + PPE
- Bring metal inspection tools
- Bring tile-safe footwear

**Interior Damage Tasks:**
- Ask for attic access
- Bring moisture meter

### 6. Auto-Appointment Prep

SmartSend prepares:
- **What tools needed** (metal tools, tile-safe footwear, moisture meter, etc.)
- **How long appointment will take** (estimated duration)
- **Which rep should go** (metal specialist, tile specialist, general)
- **Weather-safe times** (avoid rain for leak inspections)
- **Daylight windows** (always required for roof inspections)
- **Travel logic** (estimated travel time)

**Example:**
Photo suggests metal roof → assign Metal Specialist Rep 2

### 7. Photo-Driven Upsell Detection

If SmartSend sees:
- Cracked skylight → skylight replacement
- Gutter sag → gutter upgrade
- Pipe boot crack → tune-up package
- Moss → roof cleaning upsell

SmartSend labels: **Upsell Opportunity**

### 8. Multi-Photo Intelligence (v1)

When multiple photos uploaded:
- Compares each photo
- Builds timeline
- Detects patterns
- Finds consistency
- Increases confidence interval

**Example:**
Interior + exterior leak = **Confirmed Leak Path**

### 9. Photo Quality Check

SmartSend identifies:
- Blurry photos
- Too dark
- Too close
- Too far
- Angle issues

Then sends message:
**"Can you send one more photo from further back?"**

This improves accuracy.

## 🗄️ Database Schema

### Tables Created

1. **`photo_intelligence`** - Main intelligence store
   - Comprehensive damage detection fields
   - Material detection fields
   - Severity scoring
   - Insurance indicators
   - Upsell opportunities
   - Photo quality assessment

2. **`photo_damage_scores`** - Aggregated scores per contact
   - Category scores (storm, leak, material, gutter, interior)
   - Overall severity score
   - Insurance probability score
   - Repair urgency score
   - Recommendations

3. **`photo_material_tags`** - Material tags from photos
   - Tags for materials, damage, components, conditions, upsells
   - Confidence scores
   - Source tracking

4. **`photo_events`** - Event log
   - Photo analyzed events
   - Task created events
   - Appointment prepped events
   - Damage detected events

### Functions Created

1. **`calculate_photo_severity_score()`** - Calculates severity score (0-100)
2. **`calculate_insurance_indicators()`** - Counts insurance indicators
3. **`calculate_contact_photo_scores()`** - Aggregates scores from all photos
4. **`auto_calculate_photo_severity()`** - Trigger function for auto-calculation

## 🔌 API Endpoints

### POST `/api/photo/analyze`

Analyzes a photo and extracts all critical roofing details.

**Request:**
```json
{
  "contactId": "uuid",
  "attachmentId": "uuid" (optional),
  "imageUrl": "string" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "photoType": "exterior_roof",
    "stormDamageDetected": true,
    "leakDetected": false,
    "severityScore": 65,
    "insuranceStrongCandidate": true,
    ...
  },
  "photoIntelligence": { ... },
  "appointmentPrep": {
    "toolsNeeded": ["Metal inspection tools", "Safety harness"],
    "estimatedDuration": 75,
    "recommendedRepType": "metal_specialist",
    "suggestedTimeSlots": [...]
  }
}
```

### GET `/api/photo/contact/{id}`

Gets comprehensive photo intelligence summary for a contact.

**Response:**
```json
{
  "success": true,
  "summary": {
    "contactId": "uuid",
    "photosAnalyzed": 3,
    "damageScores": { ... },
    "detectedDamageTypes": ["Storm Damage", "Hail Damage"],
    "materialType": "asphalt_shingle",
    "severityScore": 76,
    "insuranceLikelihood": "High",
    "urgencyLevel": "High",
    "recommendedAction": "offer_appointment_tomorrow",
    ...
  }
}
```

## 🤖 AI Analysis

### Photo Intelligence AI Function

**File:** `src/lib/ai/photoIntelligence.ts`

Uses OpenAI GPT-4o Vision API to analyze photos with comprehensive prompts covering:
- Storm damage detection
- Leak detection
- Material identification
- Condition assessment
- Insurance indicators
- Upsell opportunities
- Photo quality assessment

### Appointment Prep Logic

**File:** `src/lib/ai/appointmentPrep.ts`

Determines:
- Tools needed based on material and damage type
- Estimated appointment duration
- Recommended rep type (specialist vs general)
- Weather considerations
- Suggested time slots based on urgency
- Travel time estimates

## 🔄 Integration Points

### Attachment Upload Flow

**Files Modified:**
- `components/files/UniversalFileUpload.tsx` - Triggers photo analysis on upload
- `app/api/attachments/upload/route.ts` - Server-side trigger

**Flow:**
1. User uploads photo
2. Photo saved to storage
3. **Photo Intelligence analysis triggered automatically**
4. Analysis results stored in database
5. Auto-tasks created if needed
6. Appointment prep recommendations generated

### Material Engine Sync

Photo Intelligence syncs with Material Engine (Block 18300):
- Updates `material_intelligence` table with photo-detected materials
- Merges photo confidence with text confidence
- Updates material tags

## 📊 Key Metrics

- **Severity Score** (0-100) - Overall damage severity
- **Storm Opportunity Score** (0-100) - Likelihood of storm damage claim
- **Insurance Probability Score** (0-100) - Likelihood of insurance claim
- **Repair Urgency Score** (0-100) - How urgent repair is needed
- **Photo Quality Score** (0-100) - Photo clarity and usefulness
- **Confidence Interval** (0-100) - Analysis confidence

## 🎯 Use Cases

### 1. Storm Season
- Homeowner uploads photo after storm
- SmartSend detects hail marks and wind damage
- Auto-tasks: "Send storm inspection message"
- Auto-tasks: "Add to insurance pipeline"
- Severity score: 78 (Moderate)
- Insurance probability: High

### 2. Emergency Leak
- Homeowner uploads interior photo showing water stain
- SmartSend detects leak and emergency
- Auto-tasks: "Contact homeowner immediately"
- Auto-tasks: "Offer emergency slot"
- Severity score: 92 (Major)
- Urgency: Critical

### 3. Material Detection
- Homeowner uploads roof overview photo
- SmartSend detects metal roof
- Auto-tasks: "Bring metal inspection tools"
- Appointment prep: Assign metal specialist
- Material syncs with Material Engine

### 4. Upsell Opportunity
- Photo shows cracked skylight
- SmartSend detects skylight damage
- Labels: Upsell Opportunity
- Suggests: Skylight replacement

## 🚀 Why Roofers Will LOVE This

1. **Instant clarity before inspection** - No guesswork
2. **Insurance conversations start FASTER** - Perfect for storm seasons
3. **Photo auto-tags reduce manual work** - Massive time saver
4. **Better prep = better close rates** - Shows true professionalism
5. **Repairs and replacements upsell naturally** - More revenue

## 🎉 Why YOU Will LOVE This

1. **MAJOR differentiator** - No CRM has photo intelligence like this
2. **Sells SmartSend all by itself** - "This thing reads damage in photos???" YES.
3. **Retention skyrockets** - Contractors depend on this daily

## 📁 Files Created/Modified

### New Files
- `supabase/migrations/20250130000006_block18500_photo_intelligence_v1.sql` - Database schema
- `src/lib/ai/photoIntelligence.ts` - AI photo analysis function
- `src/lib/ai/appointmentPrep.ts` - Appointment prep logic
- `app/api/photo/analyze/route.ts` - Photo analysis endpoint
- `app/api/photo/contact/[id]/route.ts` - Contact photo summary endpoint
- `BLOCK_18500_PHOTO_INTELLIGENCE_V1_IMPLEMENTATION.md` - This file

### Modified Files
- `components/files/UniversalFileUpload.tsx` - Added photo intelligence trigger
- `app/api/attachments/upload/route.ts` - Added photo intelligence trigger

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- Workspace-scoped access control
- Service role full access for background processing
- User authentication required for all endpoints

## 📈 Next Steps

1. **Deploy migration** - Run the SQL migration
2. **Test photo upload** - Upload test photos and verify analysis
3. **View contact summaries** - Check photo intelligence panel
4. **Monitor auto-tasks** - Verify tasks are created correctly
5. **Review appointment prep** - Check tool recommendations

## 🎓 Technical Notes

- Uses OpenAI GPT-4o Vision API for photo analysis
- Analysis is non-blocking (async)
- Results cached in database for performance
- Multi-photo analysis increases confidence
- Syncs with Material Engine for comprehensive intelligence
- Auto-tasks integrate with Tasks System v3

---

**Block 18500 — SmartSend Photo Intelligence v1** ✅ COMPLETE





















































