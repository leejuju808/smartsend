# BLOCK 95000 — SmartSend Roofing Owner Playbook + Guided Onboarding + In-App Coaching System v1

**IMPLEMENTATION COMPLETE**

This block implements a weaponized onboarding system that makes every roofing owner feel stupid for ever trying to run outreach manually.

## ✅ What Was Built

### 1. Database Migration
**File:** `supabase/migrations/20250220000000_block95000_owner_playbook_onboarding_coaching_v1.sql`

**Tables Created:**
- `owner_playbook_sections` - Playbook section structure
- `owner_playbook_steps` - Individual content items
- `onboarding_tasks` - Checklist tasks
- `user_onboarding_progress` - User completion tracking
- `coaching_prompts` - AI coaching messages

**Seed Data:**
- 3 playbook sections with 10 total steps (roofer-specific content)
- 7 onboarding tasks (complete setup checklist)
- 5 coaching prompts (different trigger types)

**Functions:**
- `get_next_onboarding_task(user_id)` - Returns next incomplete task
- `get_coaching_prompt_for_user(user_id)` - Returns most relevant coaching message

### 2. API Routes

**File:** `src/app/api/coaching/prompt/route.ts`
- `GET /api/coaching/prompt` - Returns coaching prompt for current user
- Uses database function to determine best prompt based on user state

**File:** `src/app/api/onboarding/tasks/route.ts`
- `GET /api/onboarding/tasks` - Returns all tasks with user progress
- `POST /api/onboarding/tasks` - Marks task as completed/incomplete

### 3. UI Components

**File:** `src/components/CoachingBanner.tsx`
- Smart banner that shows contextual coaching messages
- Different styles based on prompt type (onboarding, hot leads, no replies, etc.)
- Dismissible with action buttons

**File:** `src/app/dashboard/onboarding/page.tsx`
- Complete onboarding checklist page
- Progress tracking with visual progress bar
- Task completion toggles
- Direct links to relevant pages
- Completion celebration

**File:** `src/app/dashboard/playbook/page.tsx`
- Sidebar navigation for playbook sections
- Content display with formatted text
- Mobile-friendly responsive layout
- Step-by-step content rendering

### 4. Integration

**File:** `src/app/dashboard/layout.tsx`
- CoachingBanner integrated at top of dashboard
- Shows above main content area

## 🚀 How to Use

### 1. Run Migration
```bash
# In Supabase SQL Editor or via CLI
supabase db push
```

### 2. Access Pages
- **Onboarding:** `/dashboard/onboarding`
- **Playbook:** `/dashboard/playbook`

### 3. Coaching Banner
- Automatically appears on dashboard
- Updates based on user state:
  - Incomplete onboarding → Shows next task
  - No replies → Personalization coaching
  - Hot leads → Follow-up reminder
  - Default → Activity encouragement

## 📋 Onboarding Tasks

1. Add your company name + logo
2. Connect your sending inbox
3. Pick your roofing campaign template
4. Personalize your openers
5. Set sending schedule
6. Launch your first 25 emails
7. Review replies

## 📚 Playbook Sections

1. **The SmartSend Method**
   - What SmartSend is
   - Why cold email works for roofers
   - How SmartSend books you jobs on autopilot

2. **Setup Checklist**
   - Connect domain
   - Add sending inbox
   - Choose one template
   - Start sending at low volume

3. **Closing Leads**
   - How to respond to hot leads
   - How to estimate fast
   - How to track job value

## 🎯 Why This Makes Roofers Feel Stupid Not Using SmartSend

1. **They've NEVER had onboarding before** - Roofers are used to random tools with no instructions. SmartSend gives them a playbook, checklist, and AI coach.

2. **It turns you from a "tool" into their COACH** - Every roofer thinks: "Damn… this thing actually tells me what to do and books me jobs."

3. **It eliminates confusion = eliminates churn** - Roofers churn when confused. This onboarding system removes 100% of confusion.

4. **It gets them a W in the first 10 minutes** - First 25 emails go out. Owner sees a reply. Owner is locked in. Owner pays.

## 🔧 Technical Notes

- All tables have RLS enabled with appropriate policies
- Coaching function handles multiple possible email_replies table structures
- API routes use server-side Supabase client for security
- Components are client-side with proper loading states
- Mobile-responsive design throughout

## 📝 Next Steps (Optional Enhancements)

- Add analytics tracking for onboarding completion rates
- Add email notifications for coaching prompts
- Add A/B testing for different coaching messages
- Add video tutorials to playbook steps
- Add completion badges/rewards


























