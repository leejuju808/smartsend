# Block 9990 — Pre-Launch QA Checklist v1

## Overview

This is the **FINAL BLOCK** of the sprint sequence before SmartSend is allowed to go into invite-only beta. This block turns everything we've built into a master checklist that acts as a quality gate.

**The Rule:** If any part of this checklist fails, SmartSend is NOT allowed to onboard a roofing company.

This is your pre-launch quality gate. This is what makes SmartSend feel elite, reliable, and money-ready.

## What Was Implemented

### 1. Database Schema ✅
**File:** `supabase/migrations/20250130000004_block9990_pre_launch_qa_checklist.sql`

- **`qa_checks` table**: Master checklist of all 99+ checks across 13 categories
- **`qa_check_results` table**: Stores results of individual checks
- **`qa_check_runs` table**: Tracks full QA runs with pass/fail status
- **`can_account_launch()` function**: Database function to check if account can launch
- **RLS policies**: Secure access control for all QA data

### 2. API Endpoints ✅

#### GET `/api/qa/checks`
- Lists all QA checks (master checklist)
- Supports filtering by category

#### POST `/api/qa/checks`
- Runs QA checks (full, category, or single check)
- Returns run ID and results summary

#### GET `/api/qa/results`
- Gets QA check results
- Supports `latest=true` to get latest run
- Supports `run_id` to get specific run

#### GET `/api/qa/can-launch`
- Checks if account can launch
- Returns `canLaunch` boolean and latest run details

### 3. Check Runner Library ✅
**File:** `lib/qa/checkRunner.ts`

Implements all 99+ check functions across 13 categories:
- **A. Core System** (11 checks)
- **B. Billing Guard** (9 checks)
- **C. Campaign Engine** (12 checks)
- **D. Template Library** (5 checks)
- **E. AI Personalization** (8 checks)
- **F. Reply AI** (11 checks)
- **G. Smart Routing** (6 checks)
- **H. SMS Forwarding** (6 checks)
- **I. Lead Timeline** (8 checks)
- **J. System Health** (9 checks)
- **K. Frontend Quality** (6 checks)
- **L. Performance** (4 checks)
- **M. Security** (6 checks)

### 4. UI Dashboard ✅
**File:** `app/(dashboard)/qa/page.tsx`

- Full QA checklist dashboard
- Category tabs for easy navigation
- Status indicators (pass/fail/warning)
- Run checks button
- Launch status alert
- Summary statistics
- Detailed results with expandable details

### 5. Launch Gate ✅
**Files:** 
- `lib/qa/launchGate.ts` - Server-side gate logic
- `components/qa/LaunchGate.tsx` - Client-side gate component

Prevents onboarding/usage if critical checks fail:
- `canAccountLaunch()` - Check if account can launch
- `requireLaunchReady()` - Middleware helper for API routes
- `<LaunchGate>` - React component to block UI access

## Usage

### Running QA Checks

1. **Navigate to QA Dashboard:**
   ```
   /qa
   ```

2. **Run Full Check:**
   - Click "Run Full Check" button
   - All 99+ checks will run
   - Results displayed in real-time

3. **Run Category Check:**
   ```typescript
   await fetch('/api/qa/checks', {
     method: 'POST',
     body: JSON.stringify({
       runType: 'category',
       category: 'billing_guard',
     }),
   });
   ```

4. **Run Single Check:**
   ```typescript
   await fetch('/api/qa/checks', {
     method: 'POST',
     body: JSON.stringify({
       runType: 'single',
       checkId: 'check-uuid',
     }),
   });
   ```

### Checking Launch Status

**Server-side:**
```typescript
import { canAccountLaunch } from '@/lib/qa/launchGate';

const { canLaunch, reason } = await canAccountLaunch(accountId);
if (!canLaunch) {
  // Block access
}
```

**Client-side:**
```tsx
import { LaunchGate } from '@/components/qa/LaunchGate';

<LaunchGate accountId={accountId}>
  {/* Content only shown if can launch */}
</LaunchGate>
```

**API Route Protection:**
```typescript
import { requireLaunchReady } from '@/lib/qa/launchGate';

export async function POST(req: Request) {
  const accountId = getAccountId(req);
  
  const blocked = await requireLaunchReady(accountId);
  if (blocked) {
    return blocked; // Returns 403 response
  }
  
  // Continue with request
}
```

### Viewing Results

1. **Latest Run:**
   ```
   GET /api/qa/results?latest=true
   ```

2. **Specific Run:**
   ```
   GET /api/qa/results?run_id=run-uuid
   ```

3. **All Runs:**
   ```
   GET /api/qa/results?account_id=account-uuid
   ```

## Checklist Categories

### ✅ A. CORE SYSTEM CHECKS (11 checks)
- Sign up works
- Login works
- Password reset works
- Owner role assigned correctly
- Invite flow works for Manager + Viewer
- Company profile saved
- Service area saved
- Sending identity configured
- Notifications page works
- Owner phone validated
- Quiet hours do not break routing

### ✅ B. BILLING GUARD CHECKS (9 checks)
- Starter plan limits enforced (1 campaign, 500 emails/month)
- Growth plan limits enforced (3 campaigns, 2000 emails/month)
- Domination plan unlimited
- Campaign creation blocked when limit exceeded
- Email sends blocked when limit exceeded
- Follow-up engine disabled when limit exceeded
- Upgrade modal appears
- Stripe subscription creates + syncs to plan
- Payment failure locks account correctly

### ✅ C. CAMPAIGN ENGINE CHECKS (12 checks)
- Create campaign
- Add contacts
- Pick templates
- Reorder steps
- Preview send
- Queue message
- Process queue
- Email delivered
- Record sent event
- Suppression list applied correctly
- Unsubscribes → auto-suppress
- Hard bounces → auto-suppress

### ✅ D. TEMPLATE LIBRARY CHECKS (5 checks)
- Roofing recipes appear
- "Use template" works
- Snippet insertion works
- Token replacement is correct
- Templates editable per campaign

### ✅ E. AI PERSONALIZATION ENGINE CHECKS (8 checks)
- Tokens replaced correctly
- Weather/local info inserted
- Human rewrite sounds natural
- No spammy phrases
- Under 130 words
- Storm campaign output makes sense
- Tune-up output makes sense
- Gutter bundle output makes sense

### ✅ F. REPLY AI CHECKS (11 checks)
- HOT classification correct
- WARM classification correct
- Neutral classification correct
- Not interested classification correct
- Unsubscribe classification correct
- Spam/OOO classification correct
- Bounce classification correct
- Hot → stop follow-ups
- Warm → stop follow-ups
- Not interested → stop follow-ups
- Unsubscribe → suppress contact

### ✅ G. SMART ROUTING CHECKS (6 checks)
- Hot reply → owner gets alert
- Warm reply → owner gets alert (if enabled)
- Priority flag set
- Lead jumps to top
- Pipeline updated to "contacted"
- Follow-ups stopped

### ✅ H. SMS FORWARDING CHECKS (6 checks)
- Owner phone validated
- SMS enabled toggle works
- Hot SMS arrives instantly
- Warm SMS arrives if enabled
- Quiet hours respected
- Rate limiting works

### ✅ I. LEAD TIMELINE CHECKS (8 checks)
- Timeline shows outbound emails
- Timeline shows inbound emails
- Timeline shows AI intent
- Timeline shows routing events
- Timeline shows SMS notifications
- Timeline shows follow-up events
- Timeline shows bounce/suppression events
- Timeline sorts by descending date

### ✅ J. SYSTEM HEALTH MONITOR CHECKS (9 checks)
- Sent counts correct
- Bounce counts correct
- Suppression counts correct
- Error counts correct
- High score when system is clean
- Score drops correctly on issues
- Health bar visible
- Campaign health drawer works
- Issue feed shows problems

### ✅ K. FRONTEND QUALITY CHECKS (6 checks)
- All modals work
- Mobile responsive enough
- No broken links
- No 500 errors on UI actions
- Important buttons disabled when unauthorized
- No infinite spinners

### ✅ L. PERFORMANCE CHECKS (4 checks)
- Campaign send queue processes within 1–2 minutes
- UI loads within 1s on major pages
- Timeline loads under 2s
- Health drawer loads under 1.5s

### ✅ M. SECURITY CHECKS (6 checks)
- API routes protected
- Permissions enforced for roles
- Billing endpoints owner-only
- Suppression list owner-only
- Invite acceptance secure
- No cross-account access

## Final Pass/Fail Rule

SmartSend can only go live if:

✔ Every rooftop-critical block works  
✔ Every roof lead flows from: template → personalize → send → reply → classify → route → alert  
✔ Billing is airtight  
✔ Owners get every hot lead instantly  
✔ No dangerous send errors or bounce explosions  

**If any part breaks:** ❌ We do NOT launch. We fix it first.

## Integration Points

### Onboarding Flow
Wrap the onboarding flow with `<LaunchGate>`:

```tsx
import { LaunchGate } from '@/components/qa/LaunchGate';

export default function OnboardingPage() {
  const { accountId } = useAuth();
  
  return (
    <LaunchGate accountId={accountId}>
      {/* Onboarding content */}
    </LaunchGate>
  );
}
```

### Campaign Creation
Protect campaign creation API:

```typescript
import { requireLaunchReady } from '@/lib/qa/launchGate';

export async function POST(req: Request) {
  const accountId = getAccountId(req);
  
  const blocked = await requireLaunchReady(accountId);
  if (blocked) return blocked;
  
  // Create campaign
}
```

### Dashboard
Show launch status on dashboard:

```tsx
import { getLaunchStatus } from '@/lib/qa/launchGate';

const { canLaunch } = await getLaunchStatus(accountId);
if (!canLaunch) {
  // Show warning banner
}
```

## Files Created

### Database
- `supabase/migrations/20250130000004_block9990_pre_launch_qa_checklist.sql`

### API Routes
- `app/api/qa/checks/route.ts`
- `app/api/qa/results/route.ts`
- `app/api/qa/can-launch/route.ts`

### Libraries
- `lib/qa/checkRunner.ts`
- `lib/qa/launchGate.ts`

### Components
- `components/qa/LaunchGate.tsx`

### Pages
- `app/(dashboard)/qa/page.tsx`

## Next Steps

1. **Run Initial QA Check:**
   - Navigate to `/qa`
   - Click "Run Full Check"
   - Review all results

2. **Fix Any Failures:**
   - Address all critical failures
   - Re-run checks until all pass

3. **Integrate Launch Gate:**
   - Add `<LaunchGate>` to onboarding flow
   - Protect critical API routes
   - Show launch status on dashboard

4. **Monitor:**
   - Run QA checks before each release
   - Keep checklist updated as features change
   - Document any new checks needed

## Notes

- All checks are automated where possible
- Some checks may need manual verification (marked as warnings)
- Critical checks block launch; non-critical checks are warnings
- Results are stored in database for audit trail
- Each run creates a new record for tracking over time

This checklist is what creates the reputation: **"SmartSend is stupidly reliable."**
























































