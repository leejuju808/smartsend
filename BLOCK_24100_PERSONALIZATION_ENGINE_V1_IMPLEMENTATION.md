# Block 24100 — SmartSend Roofing Message Personalization Engine v1

## Implementation Summary

**FULL PERSONALIZATION ENGINE — ZERO FLUFF.**

Every personalization rule directly increases:
- ✔ opens
- ✔ replies
- ✔ booked inspections
- ✔ roofing revenue
- ✔ roofer retention

This is the system that makes SmartSend feel like a real human from the roofer's company — not AI.

## The 5 Personalization Layers

### Layer 1 — Local Area Personalization (City + Neighborhood)
Automatically inserts:
- `{{city}}`
- `{{neighborhood}}`
- `{{zip_code}}`

**Example:**
"Quick question about your roof here in Spokane."
"Anyone near Lacey's Meridian neighborhood seeing wind damage?"

### Layer 2 — Weather + Storm Personalization (Critical)
Pulls and uses:
- Hail reports
- Wind speed
- Rainfall
- Snow load
- Temperature spikes

**Example:**
"Wind gusts hit 40mph last night — lifted shingles are common."
"Hail passed through {{city}} yesterday afternoon — inspections filling up."

### Layer 3 — Homeowner Behavior Personalization
Tracks and uses:
- Last reply date
- Last open
- Past clicks
- Number of follow-ups

**Example:**
"Haven't heard back since earlier — still dealing with that leak?"
"Saw you opened our message yesterday — want us to swing by?"

### Layer 4 — Roof-Specific Personalization
Uses:
- Roof type
- Repair vs replacement
- Leak location
- Age of home
- Project quoted

**Example:**
"Since your roof is around 15 years old, we recommend checking the flashing."
"Following up on the leak above the garage — want us to take a look this week?"

### Layer 5 — Human Voice Personalization (AI Tone Matching)
Analyzes and matches:
- Roofer's writing style
- Tone used in past messages
- Speech patterns
- Signature style

**Example:**
If roofer writes casual: "Hey just checking in — need us to swing by?"
If roofer writes formal: "Hi there, following up to see if you still needed an inspection."

## Database Schema

### Tables Created

1. **`roofer_voice_profiles`** — Stores roofer writing style for tone matching
2. **`personalization_cache_v1`** — Caches all 5 layers of personalization data
3. **`personalization_triggers`** — Tracks when to increase personalization aggressiveness

### Key Functions

- `rebuild_personalization_cache_v1()` — Rebuilds personalization cache for a contact/lead
- `analyze_roofer_voice_profile()` — Analyzes roofer's voice from sample messages
- `check_personalization_triggers()` — Auto-updates triggers based on email events

## API Endpoints

### POST `/api/personalization/v1`

Personalizes email templates using all 5 layers.

**Request:**
```json
{
  "template_body": "Hey {{first_name}}, quick question about your roof...",
  "template_subject": "Quick question about your roof",
  "contact_id": "uuid",
  "lead_id": "uuid", // optional, use contact_id OR lead_id
  "campaign_id": "uuid",
  "workspace_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subject": "Quick question about your roof in Spokane",
    "body": "Hey John, wind gusts hit 40mph last night — want us to check for lifted shingles?",
    "opener": "Wind gusts hit 40mph last night — lifted shingles are common.",
    "personalization_score": 85,
    "layers_applied": {
      "layer1_local": true,
      "layer2_weather": true,
      "layer3_behavior": false,
      "layer4_roof": true,
      "layer5_voice": true
    },
    "metadata": {
      "tokens_used": ["first_name", "city", "last_storm_type"],
      "local_features": ["Spokane", "Meridian"],
      "weather_context": {
        "type": "wind",
        "date": "2025-01-30",
        "risk_level": "high"
      }
    }
  }
}
```

## Integration

The personalization engine is automatically integrated into the message sending flow via `personalizeIfEnabled()` in `lib/ai/personalization-helpers.ts`.

When sending emails through campaigns, the engine:
1. Checks if workspace has personalization access (Growth/Domination plans)
2. Loads or rebuilds personalization cache
3. Applies all 5 layers of personalization
4. Returns personalized subject and body

## Usage Examples

### Basic Usage

```typescript
import { personalizeEmailV1Block24100 } from '@/lib/ai/personalization-engine-v1-block24100';

const result = await personalizeEmailV1Block24100({
  template_body: "Hey {{first_name}}, quick question about your roof...",
  template_subject: "Quick question",
  contact_id: "contact-uuid",
  campaign_id: "campaign-uuid",
  workspace_id: "workspace-uuid",
});

console.log(result.subject); // Personalized subject
console.log(result.body); // Personalized body
console.log(result.personalization_score); // 0-100
```

### Analyzing Roofer Voice

```typescript
import { analyzeRooferVoice } from '@/lib/ai/roofer-voice-analyzer';

const voiceProfile = await analyzeRooferVoice(
  workspaceId,
  rooferId, // optional
  sampleMessages // optional, will fetch from email_logs if not provided
);
```

## Personalization Triggers

SmartSend increases personalization when:
- Homeowner opened but didn't reply
- Homeowner replied once
- Storm alert hits
- Roofer hasn't booked an estimate this week
- List quality is dropping

Triggers are automatically created via database triggers when email events occur.

## Template Tokens

Available tokens for use in templates:

**Layer 1 (Local):**
- `{{city}}`
- `{{neighborhood}}`
- `{{zip_code}}`

**Layer 2 (Weather):**
- `{{last_storm_type}}`
- `{{last_storm_date}}`
- `{{storm_risk_level}}`

**Layer 3 (Behavior):**
- `{{follow_up_count}}`

**Layer 4 (Roof):**
- `{{roof_type}}`
- `{{job_type_guess}}`
- `{{roof_age_years}}`
- `{{leak_location}}`
- `{{time_since_last_quote}}`

**Layer 5 (Voice):**
- Automatically applied to entire message

**Special:**
- `{{opener}}` — AI-generated personalized opener
- `{{first_name}}` — Contact's first name

## Performance

- Personalization cache expires after 6 hours
- Cache is automatically rebuilt when expired
- Voice profiles are analyzed from last 20 messages
- All database queries are indexed for performance

## Migration

Run the migration file:
```bash
supabase migration up 20250130000002_block24100_personalization_engine_v1.sql
```

## Next Steps

1. **Enable for Workspaces**: Ensure Growth/Domination plan workspaces have access
2. **Analyze Roofer Voices**: Run voice analysis for existing roofers
3. **Monitor Performance**: Track personalization scores and conversion rates
4. **Iterate**: Use personalization triggers to optimize messaging

## Files Created

1. `supabase/migrations/20250130000002_block24100_personalization_engine_v1.sql` — Database schema
2. `lib/ai/personalization-engine-v1-block24100.ts` — Main personalization engine
3. `lib/ai/roofer-voice-analyzer.ts` — Voice analysis helper
4. `app/api/personalization/v1/route.ts` — API endpoint
5. Updated `lib/ai/personalization-helpers.ts` — Integration with message sending

## Why This Works

Personalization increases:
- **Open rates** — Local references feel authentic
- **Reply rates** — Storm context creates urgency
- **Booked inspections** — Behavior-aware follow-ups convert better
- **Revenue** — Roof-specific messaging wins more jobs
- **Retention** — Voice matching makes SmartSend feel like the roofer

That is the goal.






































