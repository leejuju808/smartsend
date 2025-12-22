# Block 21170 — SmartSend Roofing AI Phone Script Engine v1

## Implementation Summary

This block implements an AI-powered phone script generation system specifically designed for roofing companies. The system generates personalized, context-aware phone scripts that help roofers:

- Close deals confidently
- Explain insurance and deductibles clearly
- Handle objections professionally
- Communicate with adjusters effectively
- Sound professional and prepared

## What Was Built

### 1. Database Schema (`supabase/migrations/20250202000001_block21170_phone_script_engine_v1.sql`)

**Table: `phone_scripts`**
- Stores AI-generated phone scripts with full metadata
- Supports 6 script categories (A-F):
  - **Category A**: Homeowner Close Calls (5 types)
  - **Category B**: Insurance/Adjuster Calls (5 types)
  - **Category C**: Objection Handling Calls (5 types)
  - **Category D**: Deductible Explanation Calls (5 types)
  - **Category E**: Pre-Install Calls (5 types)
  - **Category F**: Post-Install Calls (4 types)
- 9 tone options: confident, friendly, professional, high_energy, insurance_based, closer, softer, short, long
- Tracks usage: viewed, copied, used, sent to calendar/email/SMS

**Functions:**
- `get_phone_script_personalization_data()` - Aggregates all data needed for script personalization
- `check_phone_script_triggers()` - Checks if conditions are met to auto-generate scripts
- `auto_generate_phone_script()` - Auto-generates scripts based on triggers

### 2. API Endpoint (`app/api/contacts/[id]/phone-script/route.ts`)

**POST `/api/contacts/[id]/phone-script`**
- Generates AI-powered phone scripts
- Parameters:
  - `script_category`: One of 29 script categories
  - `tone`: One of 9 tone options (default: "confident")
  - `regenerate`: Boolean to force regeneration
- Returns: Generated script with full structure

**GET `/api/contacts/[id]/phone-script`**
- Retrieves all scripts for a contact
- Returns: Array of scripts ordered by creation date

**Script Structure:**
Every script follows this universal template:
1. **Opening**: Confident intro, quick purpose, no rambling
2. **Context Summary**: AI summarizes claim + proposal context in 1 short sentence
3. **Value Anchor**: Why calling, why now, what's in it for homeowner
4. **Main Statement/Ask**: Clear, direct, confident
5. **Objection Handling**: 2-3 anticipated objections with rebuttals
6. **Insurance/Deductible Logic**: Explains clearly and simply (if needed)
7. **Close Sentence**: Always ends with a call-to-action
8. **Full Script**: Complete formatted script combining all parts

### 3. UI Component (`components/contacts/roofing/sections/PhoneScriptEngine.tsx`)

**Features:**
- Displays latest generated script
- Script generation form with category and tone selection
- Script history (expandable)
- Action buttons:
  - Copy script
  - Regenerate script
  - Add to calendar (coming soon)
  - Send to email (coming soon)
  - Send to SMS (coming soon)
- Visual script breakdown showing all components
- Badges showing script category and tone

**Integration:**
- Integrated into `RoofingContactCard` component
- Automatically loads when contact card is viewed
- Shows generation status and metadata

## Script Categories

### Category A — Homeowner Close Calls
- `homeowner_ready_to_schedule` - Install-Ready Close Call
- `homeowner_viewed_proposal` - Proposal Viewed Follow-Up
- `homeowner_claim_approved` - Claim Approved Celebration
- `homeowner_deductible_needed` - Deductible Collection
- `homeowner_booking_install` - Install Date Booking

### Category B — Insurance / Adjuster Calls
- `adjuster_photo_request` - Adjuster Photo Request Response
- `adjuster_supplement_followup` - Supplement Follow-Up
- `adjuster_approval_mismatch` - Approval Amount Dispute
- `adjuster_missing_line_items` - Missing Line Items Dispute
- `adjuster_op_justification` - O&P Justification

### Category C — Objection Handling Calls
- `objection_lower_price` - Lower Price Objection
- `objection_thinking_about_it` - Thinking About It Objection
- `objection_not_ready` - Not Ready Yet Objection
- `objection_waiting_insurance` - Waiting on Insurance Objection
- `objection_too_expensive` - Too Expensive Objection

### Category D — Deductible Explanation Calls
- `deductible_explanation_what_is` - What is a Deductible
- `deductible_explanation_why_pay` - Why Deductible Must Be Paid
- `deductible_explanation_waiving_illegal` - Why Waiving is Illegal
- `deductible_explanation_acv_rcv` - ACV vs RCV Explanation
- `deductible_explanation_payment_timeline` - Payment Timeline Explanation

### Category E — Pre-Install Calls
- `pre_install_confirm_date` - Confirm Install Date
- `pre_install_remind_homeowner` - Pre-Install Reminder
- `pre_install_discuss_materials` - Materials Discussion
- `pre_install_crew_arrival` - Crew Arrival Time
- `pre_install_access_confirmation` - Access Confirmation

### Category F — Post-Install Calls
- `post_install_collect_payment` - Payment Collection
- `post_install_send_warranty` - Warranty Information
- `post_install_ask_review` - Review Request
- `post_install_request_referrals` - Referral Request

## Personalization Inputs

Every script uses these data sources:

**From Contact Card:**
- Homeowner first name
- Property address
- City, state, zip
- Phone number
- Insurance carrier
- Deductible amount and type
- RCV/ACV amounts
- Claim status
- Supplement status

**From Proposal System:**
- Proposal viewed status
- Proposal viewed count
- Proposal replied status
- Proposal status

**From Timeline Engine:**
- Approval date
- Adjuster date
- Supplement timeline

**From Install-Ready Engine:**
- Install-ready score (0-100)
- Install-ready status
- Readiness triggers

**From Reply Classifier:**
- Recent classifications
- Objections detected
- Intent signals

## Trigger Logic

Scripts are auto-generated when:

1. **Proposal viewed 2+ times** → `homeowner_viewed_proposal`
2. **Install-ready score > 70** → `homeowner_ready_to_schedule`
3. **Claim approved** → `homeowner_claim_approved`
4. **Deductible detected** → `homeowner_deductible_needed`
5. **Objection detected** → Appropriate objection handling script
6. **Adjuster requests photos** → `adjuster_photo_request`
7. **Adjuster sends approval** → `adjuster_approval_mismatch` (if mismatch)
8. **Adjuster denies supplement** → `adjuster_supplement_followup`
9. **Homeowner sends objection** → Appropriate objection script
10. **Manual trigger** → User manually requests script

## Usage Examples

### Example 1: Install-Ready Close Call

**Context:**
- Homeowner: Sarah Thompson
- Insurance approved $28,500 for roof
- Proposal viewed twice this morning
- Install-ready score: 75
- Deductible: $1,500

**Generated Script:**
```
Opening:
"Hey Sarah, this is John with Titan Roofing. I wanted to follow up quickly — this will be under 60 seconds."

Context:
"I'm calling because your insurance approved $28,500 for the roof, and I saw you reviewed our proposal twice this morning."

Value Anchor:
"We can get you locked into next week's schedule before the weather shifts."

Main Ask:
"Would you prefer early next week or later in the week for the install?"

Objection Handling:
- Objection: "We're still thinking."
  Rebuttal: "Totally understand. The good news is your deductible is only $1,500 and the rest is covered. The sooner we pick a date, the sooner we can release the depreciation check."

- Objection: "We're getting other quotes."
  Rebuttal: "Absolutely — just keep in mind your insurance has already approved the pricing. Your out-of-pocket won't change regardless of who does it."

Close:
"So which works better for you — Monday or Thursday?"
```

### Example 2: Adjuster Call (Missing Items)

**Context:**
- Adjuster: Mark
- Claim: 22-87191
- Address: 1847 Cedar Lane
- Missing: Drip edge + steep charge
- Both code-required

**Generated Script:**
```
Opening:
"Hey Mark, this is John with Titan Roofing. Calling about claim 22-87191 at 1847 Cedar Lane."

Context:
"Just quick — I noticed drip edge and steep charges are missing from the scope."

Main Ask:
"Both are code-required in this city and appear in the insured's photos. Can you help me get those added so the claim reflects full replacement?"

Objection Handling:
- Objection: "Drip edge isn't required."
  Rebuttal: "Actually it is — IRC R905.2.8.5. I can send you the code citation if helpful."

Close:
"Perfect — appreciate it Mark. Can I expect updated pricing by end of day?"
```

## Integration Points

The Phone Script Engine integrates with:

1. **Install-Ready Predictor (21110)** → Generates install-ready close scripts
2. **Proposal Engine (20520/20560)** → Generates proposal follow-up scripts
3. **Adjuster Engine (20590)** → Generates adjuster communication scripts
4. **Timeline Engine (21050)** → Uses timeline data for context
5. **Reply Classification v2 (20990)** → Detects objections and generates handling scripts

## Next Steps (Future Enhancements)

1. **Auto-Generation Triggers**: Add database triggers to auto-generate scripts when events occur
2. **Calendar Integration**: Connect "Add to Calendar" button to calendar sync
3. **Email/SMS Integration**: Connect send buttons to email/SMS systems
4. **Script Analytics**: Track which scripts lead to closes
5. **A/B Testing**: Test different tones and approaches
6. **Spanish Support**: Add Spanish language scripts (v2)
7. **Voice Recording**: Allow roofers to record themselves reading scripts
8. **Script Templates**: Allow custom script templates per company

## Files Created/Modified

### Created:
- `supabase/migrations/20250202000001_block21170_phone_script_engine_v1.sql`
- `app/api/contacts/[id]/phone-script/route.ts`
- `components/contacts/roofing/sections/PhoneScriptEngine.tsx`

### Modified:
- `components/contacts/roofing/RoofingContactCard.tsx` - Added Phone Script Engine section

## Testing Checklist

- [ ] Generate script for each category
- [ ] Test all tone variations
- [ ] Verify personalization data is correct
- [ ] Test script regeneration
- [ ] Test script copying
- [ ] Verify script history works
- [ ] Test trigger detection
- [ ] Verify integration with contact card
- [ ] Test with missing data (graceful degradation)
- [ ] Verify RLS policies work correctly

## Deployment Notes

1. Run migration: `supabase/migrations/20250202000001_block21170_phone_script_engine_v1.sql`
2. Ensure `OPENAI_API_KEY` is set in environment
3. Verify database functions are created
4. Test API endpoint with sample contact
5. Verify UI component renders correctly
6. Test script generation end-to-end

## Summary

Block 21170 delivers a complete AI Phone Script Engine that transforms how roofing companies handle phone calls. Every script is:

- **Personalized** to the specific homeowner and job
- **Insurance-aware** with correct deductible and RCV/ACV logic
- **Objection-aware** with pre-built rebuttals
- **Proposal-aware** with context about proposal status
- **Time-aware** with appropriate urgency
- **Install-ready-aware** with readiness context

This makes SmartSend feel like "Your roofing sales manager built into the software" — a powerful, different, and HIGH VALUE feature that will be a demo-killer.
















































