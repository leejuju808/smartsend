# Block 11000 — SmartSend 15-Minute Roofer Onboarding v1

## ✅ Implementation Complete

Block 11000 has been successfully implemented, providing a streamlined 4-step onboarding flow that takes roofers from signup to a live campaign in 15-20 minutes.

## 📦 What Was Built

### 1. Database Schema ✅

**Migration File:** `supabase/migrations/20250130000004_block11000_roofer_onboarding.sql`

**Table Created:**
- `onboarding_status` - Tracks 4-step onboarding progress
  - Fields: `user_id`, `workspace_id`, `step_1_done`, `step_2_done`, `step_3_done`, `step_4_done`, `completed_at`
  - Auto-sets `completed_at` when all steps are done
  - Includes helper function `get_or_create_onboarding_status()`

**Features:**
- RLS policies for secure access
- Indexes for performance
- Update trigger for `updated_at` and auto-completion

### 2. Four-Step Onboarding Flow ✅

#### Step 1: Company Basics (`/onboarding/step-1-company`)
- **Fields:** Company Name, Owner/Contact Name, City + State, Service Focus (checklist)
- **Defaults:** Pre-checks "Repairs" + "Inspections" (highest reply rate)
- **Saves to:** `account_profiles` table (from Block 9200)

#### Step 2: Connect Sending Email (`/onboarding/step-2-email`)
- **Fields:** From Email, From Name (optional), Test Email (optional)
- **Features:** DNS/provider instructions, test email sending capability
- **Saves to:** `sending_identities` table (from Block 9200)

#### Step 3: Import Starter List (`/onboarding/step-3-contacts`)
- **Options:**
  - Upload CSV of old quotes / past leads
  - Paste emails manually (up to 20)
  - Add single contacts
- **Auto-creates:** "Old Quotes" contact list
- **Saves to:** `contacts` and `contact_lists` tables

#### Step 4: One-Click Campaign Launch (`/onboarding/step-4-launch`)
- **Pre-filled defaults:**
  - Campaign Name: "Old Quotes Reactivation"
  - Target List: Old Quotes (or first available list)
  - Template: SmartSend Roofing – Reactivation v1
  - Schedule: Day 0, 2, 4
- **Action:** Launches campaign and schedules initial batch (first 10 immediately)

### 3. API Endpoints ✅

**Created:**
- `POST /api/onboarding/step-1-company` - Save company profile
- `POST /api/onboarding/step-2-email` - Connect sending email
- `POST /api/onboarding/step-3-contacts` - Import contacts
- `POST /api/onboarding/step-4-launch` - Launch campaign
- `GET /api/onboarding/status-block11000` - Get onboarding status
- `GET /api/contact-lists` - Get contact lists for workspace

### 4. UI Pages ✅

**Created:**
- `app/(app)/onboarding/page.tsx` - Main router (redirects to appropriate step)
- `app/(app)/onboarding/step-1-company/page.tsx` - Company basics form
- `app/(app)/onboarding/step-2-email/page.tsx` - Email connection form
- `app/(app)/onboarding/step-3-contacts/page.tsx` - Contact import form
- `app/(app)/onboarding/step-4-launch/page.tsx` - Campaign launch form

**Features:**
- Clean, contractor-friendly UI
- Step-by-step progress indication
- Pre-filled defaults to reduce friction
- Clear error handling and validation

### 5. Middleware Integration ✅

**Updated:** `middleware.ts`

**Features:**
- Checks onboarding status for authenticated users
- Redirects to appropriate incomplete step
- Skips check for onboarding pages, login, and API routes
- Gracefully handles missing onboarding_status (doesn't block access)

### 6. Helper Functions ✅

**Implemented in step-4-launch API:**
- `scheduleInitialBatch()` - Schedules campaign messages into send_queue
  - First 10 contacts scheduled immediately (30 seconds apart)
  - Remaining contacts spread over next few days
  - Handles multiple send_queue schema variations
  - Creates follow-up messages (Day 2, Day 4) automatically

## 🎯 Key Features

### Contractor-Proof Defaults
- ✅ No campaign copy writing required → roofing template auto-loaded
- ✅ No advanced list logic → just Old Quotes + maybe Local Homeowners
- ✅ No schedule decisions → default 0–2–4 day follow-up
- ✅ No technical jargon → all screens written in plain roofer language

### Fast Path to Results
- ✅ In one short session (15-20 minutes), roofers go from zero → live campaign → homeowner replies
- ✅ Their existing data starts making money (Old Quotes/Excel lists finally get used)
- ✅ No marketing or tech skills needed

### Built-In Intelligence
- ✅ Uses existing roofing templates (Block 10900)
- ✅ Leverages account_profiles for personalization (Block 9200)
- ✅ Integrates with contact_lists system (Block 9200)
- ✅ Auto-schedules into send_queue for immediate sending

## 🔄 Flow Diagram

```
User Signs Up
    ↓
/onboarding (router checks status)
    ↓
Step 1: Company Basics (2 min)
    ↓
Step 2: Connect Email (5 min)
    ↓
Step 3: Import Contacts (5 min)
    ↓
Step 4: Launch Campaign (3 min)
    ↓
Campaign Active → First 10 emails going out now
    ↓
Redirect to Dashboard
```

## 📝 Database Dependencies

This block depends on:
- `workspaces` table (for workspace_id)
- `account_profiles` table (from Block 9200)
- `sending_identities` table (from Block 9200)
- `contact_lists` table (from Block 9200)
- `contacts` table (from Block 9200)
- `campaigns` table (existing)
- `send_queue` table (existing, multiple schema variations supported)
- `roofing_templates` table (from Block 10900, optional)

## 🚀 Next Steps

1. **Test the flow:** Run through all 4 steps with a test user
2. **Verify send_queue:** Ensure messages are properly scheduled
3. **Test middleware:** Verify redirects work correctly
4. **Add error handling:** Enhance error messages for edge cases
5. **Add analytics:** Track onboarding completion rates

## 📚 Related Blocks

- **Block 9200:** Onboarding Flow v1 (account_profiles, sending_identities, contact_lists)
- **Block 10900:** Roofing Templates Library (pre-loaded templates)
- **Block 10400:** Smart Personalization Engine (AI personalization)
- **Block 10200:** Mini Dashboard (where users land after onboarding)

## 🎨 UI/UX Notes

- All forms use consistent styling (Tailwind CSS)
- Clear step indicators (Step X of 4)
- Helpful tips and defaults throughout
- Minimal required fields to reduce friction
- Pre-filled values where possible























































