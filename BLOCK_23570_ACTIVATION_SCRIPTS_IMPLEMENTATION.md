# Block 23570 — SmartSend Roofing Activation Scripts v1

## ✅ Implementation Complete

Block 23570 has been successfully implemented, providing a comprehensive activation script system for onboarding roofers as SmartSend customers. This system stores all scripts, checklists, and guidance needed for successful activation calls.

## 📦 What Was Built

### 1. Database Schema ✅

**Migration File:** `supabase/migrations/20250130000003_block23570_activation_scripts_v1.sql`

**Table Created:**
- `activation_scripts` - Stores all activation scripts and guidance
  - Fields:
    - `script_type`: Type of script (call_part, followup_script, checklist, red_flag, psychology_insight)
    - `script_key`: Unique identifier for each script
    - `title`: Human-readable title
    - `script_content`: The actual script text
    - `why_it_helps`: Explanation of why this helps roofers
    - `display_order`: Order for display
    - `is_active`: Active/inactive flag

**Features:**
- Unique constraint on `script_key` to prevent duplicates
- Indexes for performance (type, key, active status, display order)
- Update trigger for `updated_at` timestamp
- Helper function `get_activation_scripts()` to retrieve scripts by type
- RLS policies for secure access

### 2. Seeded Activation Scripts ✅

All 11 parts of the activation package have been seeded:

#### Call Parts (3 parts):
1. **Welcome & Expectations** (`welcome_expectations`)
   - Sets expectation: "get your first campaign live so you start getting homeowner replies in the next 24–48 hours"
   - Why it helps: Aligns SmartSend with roofers' goal of booked estimates

2. **Account Foundations** (`account_foundations`)
   - 4 essential questions: city, phone, estimate type, existing list
   - Why it helps: Done-for-you approach that roofers love

3. **Launch First Campaign** (2 options):
   - **Option A - Lead Revival** (`launch_campaign_revival`)
     - Revives old leads that were never followed up
     - Why it helps: Fixes the money leak from not following up
   - **Option B - Free Inspection** (`launch_campaign_inspection`)
     - Puts roofer in front of homeowners needing work
     - Why it helps: Positions SmartSend as lead generator, not software

#### Follow-Up Scripts (4 scripts):
4. **First Win Script** (`first_win`)
   - Immediately after launch: "You're officially live"
   - Why it helps: Creates feeling of support, momentum, ROI

5. **24-Hour Follow-Up** (`24_hour_followup`)
   - Dashboard check-in and offer to help with responses
   - Why it helps: Helps roofers close more → SmartSend looks more powerful

6. **48-Hour Check-In** (`48_hour_checkin`)
   - "Saw a few opens coming in — that's a good sign"
   - Why it helps: Rescues disengaged roofers by showing monitoring

7. **7-Day Retention Script** (`7_day_retention`)
   - "Want me to launch your next campaign to keep your crews busy?"
   - Why it helps: Keeps them ACTIVE → ACTIVE USERS STAY SUBSCRIBED

#### Checklists & Red Flags:
8. **Activation Red Flags** (`activation_red_flags`)
   - When to intervene: no list, no campaign, 0 replies by day 3, low open rate, ignoring dashboard
   - Why it helps: Pushes roofers into momentum

9. **Activation Win Checklist** (`activation_win_checklist`)
   - 8 items that must be done before ending call
   - Why it helps: Everything feels COMPLETE → retention

#### Psychology Insights:
10. **Roofer Psychology** (`roofer_psychology`)
    - Understanding roofer feelings: overwhelmed, distracted, unsure, too busy
    - Goal: Create feeling "This is easy. This is making me money already."
    - Why it helps: Empathy-driven activation with focus on immediate ROI

### 3. API Endpoint ✅

**File:** `app/api/activation/scripts/route.ts`

**GET /api/activation/scripts**
- Retrieve activation scripts
- Query params:
  - `type`: Filter by script type
  - `key`: Get specific script by key
- Returns: Array of scripts ordered by `display_order`

**POST /api/activation/scripts**
- Create or update activation scripts (admin only)
- Body: `script_type`, `script_key`, `title`, `script_content`, `why_it_helps`, `display_order`, `is_active`
- Uses upsert on `script_key` for updates

### 4. Helper Function ✅

**Database Function:** `get_activation_scripts(p_script_type TEXT)`
- Returns scripts filtered by type (optional)
- Ordered by `display_order`
- Only returns active scripts
- Can be called from SQL or application code

## 🎯 Usage Examples

### Get All Scripts
```typescript
const response = await fetch('/api/activation/scripts');
const { scripts } = await response.json();
```

### Get Call Parts Only
```typescript
const response = await fetch('/api/activation/scripts?type=call_part');
const { scripts } = await response.json();
```

### Get Specific Script
```typescript
const response = await fetch('/api/activation/scripts?key=welcome_expectations');
const { scripts } = await response.json();
```

### Get Follow-Up Scripts
```typescript
const response = await fetch('/api/activation/scripts?type=followup_script');
const { scripts } = await response.json();
```

### Using Database Function
```sql
-- Get all scripts
SELECT * FROM get_activation_scripts();

-- Get call parts only
SELECT * FROM get_activation_scripts('call_part');

-- Get follow-up scripts
SELECT * FROM get_activation_scripts('followup_script');
```

## 📋 Activation Flow Integration

This system integrates with:
- **Block 23541** (`roofer_activation_state`) - Tracks activation pipeline state
- **Block 11000** - Onboarding flow
- Existing activation API endpoints (`/api/activation/step-*`)

### Recommended Integration Points:

1. **During Activation Call:**
   - Display call parts in order (`call_part` scripts)
   - Show checklist at end (`activation_win_checklist`)
   - Monitor for red flags (`activation_red_flags`)

2. **After Launch:**
   - Send "First Win" script immediately
   - Schedule 24-hour follow-up
   - Schedule 48-hour check-in
   - Schedule 7-day retention check

3. **Dashboard Integration:**
   - Show activation scripts in activation dashboard
   - Display checklist progress
   - Alert on red flags

## 🔒 Security

- RLS enabled on `activation_scripts` table
- Authenticated users can read active scripts
- Service role has full access
- Admin check needed for POST endpoint (TODO)

## 📊 Script Types Reference

| Type | Description | Examples |
|------|-------------|----------|
| `call_part` | Parts of the activation call | welcome_expectations, account_foundations |
| `followup_script` | Follow-up messages | 24_hour_followup, 7_day_retention |
| `checklist` | Checklists to complete | activation_win_checklist |
| `red_flag` | Warning signs to watch for | activation_red_flags |
| `psychology_insight` | Psychology guidance | roofer_psychology |

## 🚀 Next Steps

1. **UI Component:** Create React component to display scripts during activation calls
2. **Automation:** Integrate follow-up scripts with scheduled emails
3. **Analytics:** Track which scripts are most effective
4. **Admin Panel:** Create admin interface to manage scripts
5. **A/B Testing:** Test variations of scripts for optimization

## 📝 Notes

- All scripts emphasize ROI and revenue generation, not software features
- Every script includes "why it helps" to guide activation team
- Scripts are designed for 12-minute total activation call
- Focus is on creating "first win" and immediate momentum
- Retention is built through activity, not features

---

**Block 23570 Implementation Complete** ✅






































