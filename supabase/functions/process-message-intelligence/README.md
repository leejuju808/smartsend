# Block 14300 — Message Intelligence Processing Edge Function

This edge function processes incoming homeowner replies and detects intelligence categories automatically.

## Usage

```bash
POST /functions/v1/process-message-intelligence
{
  "reply_id": "uuid-of-reply",
  "reply_table": "inbox_messages", // optional, defaults to 'inbox_messages'
  "contact_id": "uuid-of-contact", // optional, will be looked up if not provided
  "lead_id": "uuid-of-lead", // optional
  "force": false // optional, force reprocessing even if already processed
}
```

## Response

```json
{
  "status": "success",
  "insight_id": "uuid",
  "insight": {
    "id": "uuid",
    "contact_id": "uuid",
    "categories": ["price_interest", "appointment_request"],
    "confidence": 0.90,
    "score_delta": 40,
    "detection_results": {...}
  }
}
```

## Detected Categories

- `price_interest` - Homeowner asking about pricing (+40 score)
- `availability_question` - Asking about availability (+50 score, HOT status)
- `appointment_request` - Requesting visit/inspection (+40 score)
- `storm_damage` - Mentions storm damage (+30 score, WARM status)
- `leak_repair` - Mentions leaks or repairs (+25 score, WARM status)
- `insurance_interest` - Mentions insurance/claims (+50 score, HOT status)
- `urgency` - Urgent requests (+50 score, HOT status, due TODAY)
- `follow_up` - Needs follow-up (+15 score)
- `not_interested` - Not interested (-30 score)
- `confusion` - Wrong person/confusion (-40 score)
- `wrong_person` - Wrong person (-40 score)
- `out_of_scope` - Out of scope (-40 score)

## Automatic Actions

When categories are detected, the system automatically:

1. **Applies tags** to the contact/lead
2. **Updates lead status** (HOT/WARM/NOT_INTERESTED/etc.)
3. **Creates tasks** for follow-up actions
4. **Updates lead score** based on detected categories
5. **Logs timeline events** for visibility

## Integration

This function can be called:
- Manually via API
- Automatically via database triggers (pg_notify)
- From webhook handlers when new replies arrive
- From other edge functions that process messages

## Environment Variables

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access





















































