# Block 17900 — SmartSend Phone Number Intelligence v1

## Implementation Summary

Complete implementation of phone number intelligence system for SmartSend, including validation, carrier lookup, line-type detection, SMS readiness, homeowner identity signals, and quality scoring.

## ✅ Completed Components

### 1. Database Schema (`supabase/migrations/20250130000004_block17900_phone_intelligence_v1.sql`)

- **phone_intelligence** table: Stores comprehensive phone intelligence data
- **phone_quality_scores** table: Tracks quality score history and breakdowns
- **phone_carriers** table: Reference table for carrier information
- **phone_line_types** table: Reference table for line type definitions
- Enums: `phone_line_type`, `sms_readiness_status`
- Functions: `calculate_phone_quality_score()`, `get_phone_intelligence_tags()`
- RLS policies for org-based access control

### 2. Phone Intelligence Library (`lib/phone-intelligence/index.ts`)

Core functions:
- `validatePhoneNumber()` - Format validation and basic checks
- `detectCarrier()` - Carrier detection (placeholder for API integration)
- `detectLineType()` - Line type detection (mobile, landline, VOIP, etc.)
- `checkSMSReadiness()` - SMS capability assessment
- `inferHomeownerSignals()` - Homeowner likelihood inference
- `calculatePhoneQualityScore()` - Quality score calculation (0-100)
- `calculateSpamRiskScore()` - Spam risk assessment
- `generatePhoneTags()` - Auto-tag generation
- `getPhoneIntelligence()` - Comprehensive intelligence retrieval

### 3. Integration Helpers (`lib/phone-intelligence/integration.ts`)

- `enrichContactPhone()` - Enrich contact with phone intelligence
- `batchEnrichContactPhones()` - Batch processing for imports
- `triggerPhoneIntelligenceUpdate()` - Manual trigger for updates

### 4. API Endpoints

#### `GET /api/phone/[number]`
- Returns comprehensive phone intelligence for a number
- Supports optional `contactId` query parameter
- Caches results for 30 days

#### `POST /api/phone/audit`
- Bulk phone audit tool
- Supports filtering by quality score and line types
- Returns summary statistics and detailed results
- Exportable to CSV

### 5. Supabase Edge Functions

#### `phone-validate` (`supabase/functions/phone-validate/index.ts`)
- Validates phone numbers
- Updates phone_intelligence table
- Placeholder for Twilio Lookup API integration

#### `phone-detect-carrier` (`supabase/functions/phone-detect-carrier/index.ts`)
- Detects carrier and line type
- Updates SMS readiness status
- Placeholder for Twilio Lookup API integration

#### `phone-score-quality` (`supabase/functions/phone-score-quality/index.ts`)
- Calculates quality scores
- Updates phone_intelligence and contacts tables
- Saves score breakdowns

### 6. Phone Audit Tool (`app/data-tools/phone-audit/page.tsx`)

Full-featured audit interface:
- Bulk scanning of contacts
- Quality score filtering
- Line type filtering
- Summary statistics cards
- Detailed results table
- CSV export functionality
- Real-time progress tracking

### 7. Contact Import Integration

Integrated into:
- `lib/import/process-import.ts` - Main import processor
- `app/api/contacts/import/commit/route.ts` - CSV import commit

Phone intelligence is automatically enriched when contacts are imported or created.

### 8. Insights Panel (`app/insights/page.tsx`)

Added phone quality insights panel showing:
- Average quality score
- Line type distribution (mobile, landline, VOIP)
- SMS readiness percentage
- Quality distribution (high, normal, low, suspect)
- Link to phone audit tool

API endpoint: `GET /api/insights/phone-quality`

### 9. Lead Scoring Integration (`lib/lead-scoring/engine.ts`)

Added `applyPhoneQualityScore()` function:
- High quality phone (90+): +10 points
- Normal phone (70-89): +5 points
- Low quality phone (50-69): -5 points
- Suspect phone (<50): -15 points

Phone quality scores automatically impact lead scoring when contacts are enriched.

## Phone Quality Scoring System

### Score Ranges
- **90-100**: High Quality (mobile, verified, matched address)
- **70-89**: Normal (decent lead quality)
- **50-69**: Low-quality lead (needs review)
- **<50**: Suspect/spam/useless (likely bad lead)

### Scoring Factors
1. **Line Type** (0-40 points)
   - Mobile: +40
   - Landline: +16
   - VOIP: +12
   - Business: +8
   - Burner/Temporary: +4

2. **Carrier** (0-20 points)
   - Major wireless (Verizon, AT&T, T-Mobile, Sprint): +20
   - Landline carriers (Comcast, Spectrum, Frontier): +5
   - VOIP carriers: -10

3. **Connection Status** (0-20 points)
   - Valid, active, reachable: +20
   - Disconnected: -40
   - Invalid: -30

4. **SMS Readiness** (0-10 points)
   - SMS ready: +10
   - Landline (no SMS): -5
   - VOIP unreliable: -5

5. **Homeowner Likelihood** (0-10 points)
   - High: +10
   - Medium: +5
   - Low: -5
   - Unlikely: -15

6. **Penalties**
   - Spam risk: -30
   - Business line: -20

## Phone Intelligence Tags

Auto-applied tags:
- "Mobile — High Quality"
- "Landline — OK"
- "VOIP — Low Intent"
- "Disconnected Number"
- "SMS Ready"
- "SMS Not Supported"
- "Spam Risk"
- "Possibly Wrong Number"
- "Carrier Risk"

## Homeowner Identity Signals

Inferred signals:
- **High**: Mobile number, matches address
- **Medium**: Landline, Frontier landline (possible older homeowner)
- **Low**: VOIP, Google Voice (renter or spam risk)
- **Unlikely**: Business line, burner/temporary number

## SMS Readiness Status

- **sms_ready**: Mobile number supports SMS
- **landline_no_sms**: Landline does not support SMS
- **voip_unreliable**: VOIP numbers may have unreliable SMS delivery
- **carrier_blocks_unknown**: Carrier blocks unknown senders (requires API check)
- **unknown**: SMS capability unknown

## Future Enhancements

### Recommended Integrations

1. **Twilio Lookup API**
   - Real carrier detection
   - Line type verification
   - Active/disconnected status
   - Update `detectCarrier()` and Edge Functions

2. **NumVerify API** (Alternative)
   - Phone validation
   - Carrier lookup
   - Line type detection

3. **Truecaller API** (Optional)
   - Spam detection
   - Business line detection
   - Name matching

### Performance Optimizations

1. **Background Jobs**
   - Queue phone intelligence updates
   - Batch process during off-peak hours
   - Cache results more aggressively

2. **Rate Limiting**
   - Respect API rate limits
   - Implement exponential backoff
   - Use connection pooling

3. **Caching Strategy**
   - Cache phone intelligence for 30 days
   - Invalidate on contact update
   - Use Redis for distributed caching

## Usage Examples

### Get Phone Intelligence
```typescript
import { getPhoneIntelligence } from '@/lib/phone-intelligence';

const intelligence = await getPhoneIntelligence(
  supabase,
  '+15551234567',
  orgId,
  contactId
);

console.log(intelligence.qualityScore); // 85
console.log(intelligence.lineType.lineType); // 'mobile'
console.log(intelligence.smsReadiness.status); // 'sms_ready'
```

### Enrich Contact Phone
```typescript
import { enrichContactPhone } from '@/lib/phone-intelligence/integration';

await enrichContactPhone(
  supabase,
  contactId,
  '+15551234567',
  orgId
);
```

### Apply Phone Quality to Lead Score
```typescript
import { applyPhoneQualityScore } from '@/lib/lead-scoring/engine';

await applyPhoneQualityScore(
  supabase,
  leadId,
  contactId
);
```

## Database Schema Reference

### phone_intelligence
- `phone_number` (text, unique per org)
- `org_id` (uuid)
- `contact_id` (uuid, nullable)
- `is_valid`, `is_active`, `is_reachable`, `is_disconnected`, `is_temporary`
- `line_type` (enum)
- `carrier_name`, `carrier_type`
- `sms_readiness` (enum)
- `homeowner_likelihood` (text)
- `quality_score` (integer, 0-100)
- `spam_risk_score` (integer, 0-100)
- `metadata` (jsonb)

### phone_quality_scores
- `phone_intelligence_id` (uuid)
- `quality_score` (integer)
- `spam_risk_score` (integer)
- `score_factors` (jsonb)

## API Reference

### GET /api/phone/[number]?contactId=uuid
Returns phone intelligence object.

### POST /api/phone/audit
Body:
```json
{
  "contactIds": ["uuid1", "uuid2"], // Optional
  "limit": 1000,
  "minQualityScore": 70,
  "lineTypes": ["mobile", "landline"]
}
```

### GET /api/insights/phone-quality
Returns phone quality statistics for organization.

## Files Created/Modified

### Created
- `supabase/migrations/20250130000004_block17900_phone_intelligence_v1.sql`
- `lib/phone-intelligence/index.ts`
- `lib/phone-intelligence/integration.ts`
- `app/api/phone/[number]/route.ts`
- `app/api/phone/audit/route.ts`
- `app/api/insights/phone-quality/route.ts`
- `app/data-tools/phone-audit/page.tsx`
- `supabase/functions/phone-validate/index.ts`
- `supabase/functions/phone-detect-carrier/index.ts`
- `supabase/functions/phone-score-quality/index.ts`

### Modified
- `lib/import/process-import.ts` - Added phone intelligence enrichment
- `app/api/contacts/import/commit/route.ts` - Added phone intelligence enrichment
- `app/insights/page.tsx` - Added phone quality insights panel
- `lib/lead-scoring/engine.ts` - Added phone quality score integration

## Testing Checklist

- [ ] Run database migration
- [ ] Test phone validation with various formats
- [ ] Test carrier detection (placeholder)
- [ ] Test line type detection
- [ ] Test SMS readiness detection
- [ ] Test quality score calculation
- [ ] Test phone audit tool
- [ ] Test contact import with phone numbers
- [ ] Test insights panel
- [ ] Test lead scoring integration
- [ ] Test API endpoints
- [ ] Test Edge Functions (when deployed)

## Notes

- Phone intelligence is cached for 30 days to reduce API calls
- Integration with external APIs (Twilio Lookup) is prepared but not implemented
- All phone numbers are normalized to E.164 format
- Quality scores are calculated using multiple factors for accuracy
- Phone intelligence automatically updates when contacts are imported or created





















































