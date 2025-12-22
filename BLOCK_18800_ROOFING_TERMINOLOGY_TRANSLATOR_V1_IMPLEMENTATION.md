# Block 18800 — SmartSend Roofing Terminology Translator v1

## Implementation Summary

This block implements a comprehensive AI engine that translates homeowner language into exact roofing terminology, damage types, insurance categories, and sales-friendly definitions.

## Features Implemented

### 1. Database Schema ✅

**Migration:** `supabase/migrations/20250130000001_block18800_roofing_terminology_translator_v1.sql`

**Tables Created:**
- `terminology_translations` - Main table storing AI translations from homeowner language to roofing terminology
- `terminology_scores` - Calculated scores and metrics for terminology translations
- `homeowner_phrases` - Common homeowner phrases and their translations (for learning/improvement)

**Key Fields:**
- Homeowner message and source
- Roofing term translation
- Material type, damage type, repair category, storm category, insurance category
- Urgency level and severity score (0-100)
- AI-generated explanation ("What the homeowner REALLY means")
- Detected keywords and keyword explanations
- Material detection with confidence
- Storm impact score
- Replacement probability and likelihood score
- Recommended actions and tasks
- Repair cost range
- Translation confidence

**Database Functions:**
- `increment_homeowner_phrase_usage()` - Tracks phrase usage for learning
- `calculate_terminology_severity_score()` - Calculates severity score from translation
- `get_latest_terminology_translation()` - Gets latest translation for a contact

**Triggers:**
- Auto-calculates severity score when translation is created
- Updates `updated_at` timestamp

### 2. AI Translation Service ✅

**File:** `src/lib/roofing-terminology-translator.ts`

**Features:**
- Translates homeowner messages to roofing terminology using OpenAI GPT-4o-mini
- Classifies into 5 core categories:
  1. Structural Roof Problems
  2. Shingle Problems
  3. Flashing Problems
  4. Ventilation Problems
  5. Interior Leak Evidence
- Detects industry keywords (leak, missing, hail, wind, insurance, adjuster, claim, etc.)
- Provides keyword explanations for contractors
- Calculates severity scores (curled shingles=40, interior stain=85, missing shingles=75, etc.)
- Determines insurance categories (storm, wear_tear, manufacturer_defect, etc.)
- Calculates replacement probability from message wording
- Detects material types from messages
- Generates AI explanations ("What the homeowner REALLY means")
- Suggests recommended actions and tasks

**Translation Examples:**
- "shingles fell off" → "wind uplift on ridge cap"
- "my roof looks weird" → "granule loss on west slope"
- "there's a brown spot on my ceiling" → "interior moisture intrusion"
- "the metal thing is loose" → "loose flashing around vent pipe"
- "I see a bump under the roof" → "buckling underlayment"

### 3. API Routes ✅

**POST /api/terms/translate**
- Translates homeowner message to roofing terminology
- Saves translation to database
- Updates homeowner phrases table for learning
- Returns translation with all classifications and scores

**GET /api/terms/{contactId}**
- Gets all terminology translations for a contact
- Returns latest translation, all translations, scores, keywords, and keyword explanations
- Aggregates detected keywords across all translations

**POST /api/terms/score**
- Worker endpoint to recalculate terminology scores
- Can process single translation or all translations for a contact

**POST /api/terms/insurance**
- Worker endpoint to categorize translations for insurance purposes
- Calculates insurance scores based on category
- Updates score records

### 4. UI Component ✅

**File:** `components/contacts/TerminologyTranslatorPanel.tsx`

**Features:**
- Input field to translate new homeowner messages
- Displays latest translation with:
  - Original homeowner message
  - Translated roofing term
  - AI explanation ("What the homeowner REALLY means")
  - Severity score and confidence
  - Classification badges (damage type, repair category, storm category, insurance category)
  - Detected keywords with explanations
  - Recommended actions and tasks
  - Material detection
  - Replacement probability
- Color-coded urgency levels
- Visual severity indicators
- Keyword highlighting with tooltips
- Translation history count

**Integration:**
- Added to contact profile v2 page (`app/contacts/[contactId]/v2/page.tsx`)
- Displays in left panel alongside Material Summary and Roof Value Summary

### 5. Translation Categories

**5 Core Translation Categories:**

1. **Structural Roof Problems**
   - sagging
   - soft spots
   - decking issues

2. **Shingle Problems**
   - missing
   - lifted
   - blown-off
   - cracked
   - granule loss

3. **Flashing Problems**
   - chimney
   - skylight
   - valleys
   - step flashing

4. **Ventilation Problems**
   - attic moisture
   - ridge vent issues

5. **Interior Leak Evidence**
   - stains
   - mold
   - peeling paint
   - humidity issues

### 6. Severity Scoring

Severity scores are calculated based on:
- Urgency level (emergency=50, high=35, medium=20, low=10)
- Damage type (interior_leak=30, structural=25, shingle=15, flashing=10, ventilation=5)
- Storm connection (+15 bonus)

**Example Scores:**
- curled shingles → 40
- interior stain → 85
- missing shingles → 75
- cracked tile → 70
- metal denting → 65
- pipe boot crack → 60
- vent flashing issue → 55
- moss growth → 25

### 7. Insurance Categories

SmartSend tags translations with:
- storm (hail/wind)
- wear & tear
- manufacturer defect
- improper installation
- aging
- emergency leak

### 8. Keyword Detection

**Industry Keywords Detected:**
- leak, missing, hail, wind
- insurance, adjuster, claim
- brown spot, water damage, stain, mold
- curled, lifted, blown off, cracked
- granule, flashing, vent, chimney, skylight
- sagging, soft spot, buckling
- moss, algae, dented, bruised
- storm, damage, repair, replace

Each keyword has an explanation for contractors (e.g., "leak: Indicates active water intrusion - high priority").

### 9. Replacement Probability

Calculated from message wording:
- "roof is old" → HIGH
- "house built in 2002" → HIGH (if age > 20 years)
- "multiple leaks" → HIGH
- "missing shingles for years" → HIGH
- "storm last month made it worse" → MEDIUM

### 10. Task Suggestions

Each translation produces suggested tasks:
- emergency_call_homeowner
- schedule_asap
- prepare_inspection
- bring_moisture_meter
- schedule_inspection

## Why Roofers Will LOVE This

🔥 **1. Zero confusion** - They instantly know what the homeowner means

🔥 **2. Professional clarity** - Helps sales reps SOUND like experts

🔥 **3. Faster, more accurate follow-up** - No guessing

🔥 **4. Better insurance conversations** - Correct terminology = higher approval rate

🔥 **5. Saves time** - AI handles translation for them

## Why YOU Will LOVE This

🔥 **1. This feature feels magical to contractors** - "This AI tells me EXACTLY what they're talking about."

🔥 **2. Eliminates miscommunication** - Makes SmartSend look incredibly smart

🔥 **3. DIFFERENTIATOR: no CRM has this** - You're building the Tesla of roofing CRMs

## Technical Architecture

### Database Tables
- `terminology_translations` - Main translations table
- `terminology_scores` - Score calculations
- `homeowner_phrases` - Phrase learning database

### Workers
- `/api/terms/score` - Score recalculation
- `/api/terms/insurance` - Insurance categorization

### API Endpoints
- `POST /api/terms/translate` - Translate message
- `GET /api/terms/{contactId}` - Get translations for contact

### UI Components
- `TerminologyTranslatorPanel` - Main UI component
- Integrated into contact profile v2

## Usage Example

1. Contractor receives message: "There's a brown spot on my ceiling"
2. Contractor pastes message into Terminology Translator
3. SmartSend translates to: "Interior moisture intrusion"
4. AI explains: "This likely means the step flashing around the entry roof is compromised. Could be wind lift or improper installation."
5. System highlights keywords: "brown spot", "ceiling", "water damage"
6. Severity score: 85 (HIGH urgency)
7. Recommended action: "Offer emergency appointment today"
8. Suggested tasks: ["emergency_call_homeowner", "schedule_asap", "prepare_inspection"]

## Next Steps

- Auto-translate messages from email/SMS when received
- Integrate with task system to auto-create tasks from translations
- Add translation history view
- Allow contractors to verify/correct translations for learning
- Build translation analytics dashboard





















































