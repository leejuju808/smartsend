# Block 19000 — SmartSend AI Insurance Brain v1 Implementation

## 🎯 Mission

Turn SmartSend into the smartest insurance assistant in the roofing industry — automatically reading every message, photo, and detail to determine:

- ✅ If insurance is involved
- ✅ How likely a claim is to succeed
- ✅ What type of claim it would be
- ✅ Whether deductible is mentioned
- ✅ Whether adjuster is coming
- ✅ Whether homeowner qualifies
- ✅ How to guide the homeowner
- ✅ What the roofer should do next
- ✅ What tasks, actions, and alerts should fire

This instantly makes SmartSend feel like a roofing-insurance consultant.

---

## 📋 Implementation Summary

### ✅ Completed Components

#### 1. **Enhanced Database Schema** (`20250130000004_block_19000_insurance_brain_v1.sql`)

**New Tables:**
- `insurance_claims` - Detailed claim tracking with claim type, coverage type, approval likelihood
- `insurance_intelligence` - Comprehensive intelligence dashboard data
- `state_insurance_rules` - State-specific insurance rules (deductible laws, matching laws, etc.)

**Enhanced Tables:**
- `insurance_metadata` - Added fields for claim type, coverage type, deductible affordability, approval likelihood, supplement potential, state rules

**Key Features:**
- Claim type classification (Wind, Hail, Leak, Tree Impact, Ice Dam, General Storm)
- Coverage type detection (RCV, ACV, Depreciation, Deductible Policy, Cosmetic Exclusion, Matching Law, Manufacturer Defect)
- Deductible intelligence and affordability analysis
- Approval likelihood scoring
- Supplement opportunity detection
- State-specific rules mapping

#### 2. **Enhanced Detection Engine** (`detect_insurance_keywords_v2`)

**100+ Keywords Detected:**
- Core insurance terms (claim, adjuster, deductible, ACV, RCV, etc.)
- Storm damage terms (hail, wind, missing shingles, etc.)
- Water/leak terms (leak, water damage, mold, etc.)
- Tree impact terms
- Ice dam terms
- Adjuster timeline terms
- Coverage terms
- Process terms
- Financial terms
- Status terms

**Confidence Scoring:**
- Base confidence from keyword count
- Boost for high-value keywords (adjuster, claim number, scope of loss)
- Boost for multiple high-value keywords
- Boost for attachments (PDFs likely insurance documents)

#### 3. **Claim Type Classification** (`classify_claim_type`)

**6 Claim Types:**
1. **Wind Claim** - Missing shingles, bent shingles, ridge cap loss
2. **Hail Claim** - Round marks, granule loss, dented metal, post-storm timing
3. **Leak / Water Damage** - Interior stains, mold, wet drywall, attic drips
4. **Tree Impact** - Heavy storm, debris hit, broken structure
5. **Ice Dam** - Northern regions, ice buildup
6. **General Storm** - Mixed wind + hail

**Scoring:**
- Scores each claim type based on keyword matches
- Returns highest scoring type with confidence
- Handles mixed scenarios (wind + hail = general storm)

#### 4. **Coverage Type Detection** (`detect_coverage_type`)

**7 Coverage Types:**
- RCV (Replacement Cost Value)
- ACV (Actual Cash Value)
- Depreciation
- Deductible Policy
- Cosmetic Exclusion
- Matching Law
- Manufacturer Defect

**Detection:**
- Scans text for coverage type mentions
- Returns detected type and source

#### 5. **Deductible Intelligence** (`detect_deductible_intelligence`)

**Features:**
- Extracts deductible amount from text (regex patterns)
- Analyzes affordability (high/medium/low based on amount)
- Checks for deductible waiver applicability (state-specific)
- Returns comprehensive deductible analysis

#### 6. **Adjuster Timeline Recognition** (`detect_adjuster_timeline`)

**Status Detection:**
- `not_scheduled` - No adjuster mentioned
- `scheduled` - Adjuster meeting scheduled
- `visited` - Adjuster has visited
- `report_pending` - Waiting for adjuster report
- `report_received` - Adjuster report received

**Auto-Task Creation:**
- Before adjuster: "Ask homeowner to take 5 more photos"
- After adjuster: "Follow up asking for adjuster conclusion"
- If approved: "Book job installation appointment"
- If denied: "Prepare supplement outline"

#### 7. **Enhanced Probability Score** (`calculate_insurance_probability_score_v2`)

**9 Scoring Factors (0-100 total):**
1. Storm Severity (0-15 points)
2. Storm Proximity (0-10 points)
3. Photo Evidence (0-10 points)
4. Language Clues (0-20 points)
5. Roof Age (0-10 points)
6. Neighborhood History (0-10 points)
7. Deductible Logic (0-10 points)
8. Material Vulnerability (0-5 points)
9. Value Estimator (0-10 points)

**Score Categories:**
- 80-100: Active Claim
- 60-79: Strong Likelihood
- 30-59: Possible Claim
- 0-29: Low Probability

#### 8. **Approval Likelihood Engine** (`calculate_approval_likelihood`)

**5 Factors:**
1. Roof Age (older = higher likelihood)
2. Storm Evidence (hail/wind/hurricane = higher)
3. Documents (insurance docs provided = higher)
4. Adjuster Status (met/scope received = higher)
5. Coverage Type (RCV = higher, ACV = lower)

**Likelihood Categories:**
- High (75+ score)
- Moderate (60-74 score)
- Low (40-59 score)
- Likely Denial (<40 score)
- Supplement Required (if denied)

#### 9. **Supplement Detection Engine** (`detect_supplement_opportunities`)

**5 Opportunity Types:**
1. **Code Upgrades** - Code upgrades usually payable
2. **Flashing Issues** - Missing step flashing — usually payable
3. **Ventilation Issues** - Attic ventilation upgrades often covered
4. **Accessory Items** - Ridge cap upgrade recommended
5. **Unseen Damages** - Additional damage may require supplement

**Potential Levels:**
- High (3+ opportunities)
- Medium (2 opportunities)
- Low (1 opportunity)
- None (0 opportunities)

#### 10. **State-Specific Rules** (`state_insurance_rules`)

**Rules Tracked:**
- Deductible waiver availability
- Matching law enforcement
- Bad faith laws
- Attic ventilation rules
- Flashing code requirements

**Initial States Seeded:**
- WA, TX, FL, CO, CA, NC, SC, GA, TN, OK

#### 11. **Comprehensive Intelligence Analysis** (`analyze_insurance_intelligence`)

**Master Function:**
- Combines all detection engines
- Runs keyword detection
- Classifies claim type
- Detects coverage type
- Analyzes deductible
- Tracks adjuster timeline
- Calculates approval likelihood
- Detects supplement opportunities
- Calculates probability score
- Upserts intelligence data

---

### ✅ API Endpoints

#### 1. **GET /api/insurance/contact/{id}**
Returns comprehensive insurance intelligence for a contact:
- Insurance intelligence data
- Insurance claim data
- Insurance metadata (Block 17400)
- Insurance scores
- Insurance timeline
- Insurance events
- State rules

#### 2. **POST /api/insurance/update**
Updates insurance intelligence for a contact:
- Accepts text for analysis
- Updates claim fields
- Generates tasks automatically
- Returns updated intelligence

---

### ✅ Workers (Supabase Edge Functions)

#### 1. **/insurance/detect** (Enhanced from Block 17400)
- Scans messages for insurance keywords
- Auto-applies insurance detection
- Processes contacts in batches

#### 2. **/insurance/score**
- Calculates insurance probability scores
- Runs comprehensive intelligence analysis
- Updates insurance intelligence table

#### 3. **/insurance/tasks**
- Generates insurance-related tasks automatically
- Based on claim status and adjuster timeline
- Creates tasks for before/after adjuster, approved/denied scenarios

#### 4. **/insurance/approvalPredict**
- Calculates approval likelihood
- Updates insurance claims with predictions
- Processes all insurance-tagged contacts

#### 5. **/insurance/supplementDetect**
- Detects supplement opportunities
- Updates insurance claims with opportunities
- Scans recent messages for supplement indicators

---

### ✅ UI Components

#### 1. **InsuranceIntelligencePanel** (`components/contacts/v2/InsuranceIntelligencePanel.tsx`)

**Displays:**
- Insurance Probability Score (0-100) with progress bar
- Claim Type with confidence
- Coverage Type (if detected)
- Deductible amount and affordability
- Adjuster Status
- Approval Likelihood with score
- Storm Severity
- Estimated Payout (min/max/actual)
- Supplement Opportunities (if any)
- Next Best Action
- Detected Keywords (first 10)

**Features:**
- Beautiful gradient card design
- Color-coded badges for status
- Conditional rendering (only shows if insurance candidate)
- Real-time data loading from API

#### 2. **Contact Profile Integration** (`app/contacts/[contactId]/v2/page.tsx`)
- Added InsuranceIntelligencePanel to contact profile
- Displays alongside existing InsuranceToolkit
- Integrated with full contact data API

---

## 🔄 Integration Points

### Message Processing
- Insurance detection triggers automatically on inbound messages (via trigger)
- Uses `detect_insurance_keywords_v2` function
- Auto-applies insurance detection when keywords found

### Contact Profile
- Insurance Intelligence Panel displays on contact profile page
- Shows comprehensive intelligence data
- Updates in real-time as new data arrives

### Task Generation
- Auto-creates tasks based on insurance status
- Tasks created for:
  - Before adjuster (photo prep)
  - After adjuster (follow-up)
  - If approved (booking)
  - If denied (supplement prep)

### API Integration
- Contacts full API includes insurance intelligence
- Separate insurance API for detailed intelligence
- Update API for manual intelligence updates

---

## 📊 Database Schema

### New Tables

**insurance_claims**
- Detailed claim tracking
- Claim type classification
- Coverage type detection
- Approval likelihood
- Supplement opportunities
- State rules

**insurance_intelligence**
- Comprehensive intelligence dashboard data
- Probability score
- All detection results
- Next best action
- Recommended tasks

**state_insurance_rules**
- State-specific insurance rules
- Deductible laws
- Matching laws
- Bad faith laws
- Code requirements

### Enhanced Tables

**insurance_metadata** (from Block 17400)
- Added: claim_type, coverage_type, deductible_affordability
- Added: approval_likelihood, supplement_potential
- Added: state_code, next_best_action

---

## 🚀 Usage Examples

### 1. Auto-Detection on Message
```sql
-- Trigger automatically runs when message received
-- Detects insurance keywords
-- Auto-applies insurance detection
-- Calculates scores
-- Generates tasks
```

### 2. Manual Intelligence Analysis
```typescript
// Call API to analyze intelligence
const response = await fetch(`/api/insurance/update`, {
  method: 'POST',
  body: JSON.stringify({
    contact_id: 'xxx',
    text: 'Homeowner says: "I filed a claim, adjuster is coming next week, deductible is $1,500"'
  })
});
```

### 3. Get Intelligence Dashboard
```typescript
// Get comprehensive intelligence
const response = await fetch(`/api/insurance/contact/${contactId}`);
const data = await response.json();
// Returns: intelligence, claim, metadata, scores, timeline, events, state_rules
```

---

## 🎨 UI Features

### Insurance Intelligence Panel
- **Probability Score**: Visual progress bar (0-100)
- **Claim Type**: Badge with confidence percentage
- **Coverage Type**: Display if detected
- **Deductible**: Amount with affordability badge
- **Adjuster Status**: Current status badge
- **Approval Likelihood**: Color-coded badge with score
- **Estimated Payout**: Highlighted green box
- **Supplement Opportunities**: List of opportunities with reasons
- **Next Best Action**: Blue highlighted box
- **Detected Keywords**: Tag cloud (first 10)

---

## 🔥 Why Roofers Will LOVE This

1. **SmartSend becomes their insurance expert**
   - No need for another software
   - Everything in one place

2. **Stronger close rates**
   - Insurance jobs = biggest profits
   - Clear guidance for reps

3. **Clear guidance for reps**
   - No confusion in the field
   - Next best action always clear

4. **Faster follow-ups**
   - Auto-tasks prevent missed opportunities
   - Timeline tracking ensures nothing falls through cracks

5. **More supplements = more revenue**
   - Detects supplement opportunities automatically
   - Increases job size

---

## 🚀 Why YOU Will LOVE This

1. **Flagship feature**
   - First AI insurance brain in roofing
   - Massive differentiation

2. **Roofers will brag**
   - "This thing understands insurance better than my office manager"

3. **HUGE differentiation**
   - No CRM does this. NONE.

4. **Makes SmartSend sticky**
   - Once roofers rely on insurance workflows, they NEVER leave

---

## 📝 Next Steps (Future Enhancements)

### v2 Features (Future)
- Full state code integration
- PDF document parsing (OCR)
- Photo analysis for damage detection
- Integration with insurance carrier APIs
- Automated supplement submission
- Real-time adjuster tracking
- Insurance carrier-specific rules
- Multi-claim support
- Claim history tracking

---

## 🧪 Testing

### Test Scenarios

1. **Wind Claim Detection**
   - Message: "Missing shingles after wind storm"
   - Expected: Claim type = wind, confidence > 0.7

2. **Hail Claim Detection**
   - Message: "Hail damage, round marks on roof"
   - Expected: Claim type = hail, confidence > 0.7

3. **Deductible Detection**
   - Message: "Deductible is $1,500"
   - Expected: Deductible = 1500, affordability = medium

4. **Adjuster Timeline**
   - Message: "Adjuster is coming next week"
   - Expected: Adjuster status = scheduled

5. **Coverage Type Detection**
   - Message: "Insurance said they'll pay ACV only"
   - Expected: Coverage type = ACV

6. **Supplement Detection**
   - Message: "Missing step flashing, code upgrade needed"
   - Expected: Supplement potential = high, opportunities include flashing_issue

---

## 📚 Files Created/Modified

### Database
- `supabase/migrations/20250130000004_block_19000_insurance_brain_v1.sql`

### API Routes
- `app/api/insurance/contact/[id]/route.ts`
- `app/api/insurance/update/route.ts`
- `app/api/contacts/[id]/full/route.ts` (enhanced)

### UI Components
- `components/contacts/v2/InsuranceIntelligencePanel.tsx`
- `app/contacts/[contactId]/v2/page.tsx` (enhanced)

### Workers
- `supabase/functions/insurance-score/index.ts`
- `supabase/functions/insurance-tasks/index.ts`
- `supabase/functions/insurance-approvalPredict/index.ts`
- `supabase/functions/insurance-supplementDetect/index.ts`

### Documentation
- `BLOCK_19000_INSURANCE_BRAIN_V1_IMPLEMENTATION.md`

---

## ✅ Implementation Complete

All components of Block 19000 — SmartSend AI Insurance Brain v1 have been successfully implemented:

- ✅ Enhanced database schema
- ✅ 100+ keyword detection engine
- ✅ Claim type classification
- ✅ Coverage type detection
- ✅ Deductible intelligence
- ✅ Adjuster timeline recognition
- ✅ Enhanced probability scoring
- ✅ Approval likelihood engine
- ✅ Supplement detection
- ✅ State-specific rules
- ✅ API endpoints
- ✅ Workers
- ✅ UI dashboard panel

**Status: READY FOR TESTING** 🚀





















































