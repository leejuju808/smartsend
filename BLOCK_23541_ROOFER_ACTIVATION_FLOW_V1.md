# Block 23541 — SmartSend Roofing Demo → Activation Flow v1

**Status:** ✅ Complete  
**Migration:** `supabase/migrations/20250130000002_block23541_roofer_activation_flow_v1.sql`

---

## Mission

FULL PIPELINE. ZERO FLUFF. BUILT TO TURN ROOFERS INTO PAYING USERS FAST.

After a demo, here's the revenue path:
1. Decision Capture
2. Stripe Subscription
3. Account Creation in SmartSend
4. Foundation Setup (Brand + Settings)
5. Import Homeowner List
6. Launch First Campaign

This flow removes all friction so roofers experience value in minutes — not later.

---

## What Was Built

### 1. Database Migration

**File:** `supabase/migrations/20250130000002_block23541_roofer_activation_flow_v1.sql`

Creates three tables:

#### `roofer_activation_state`
Tracks where each roofer is in the activation pipeline:
- Step tracking (0-6)
- Plan selection (starter/growth/domination)
- Stripe subscription info
- Account creation details
- Foundation setup data
- Import stats
- First campaign info

#### `activation_checkins`
Tracks 48-hour and 7-day check-ins:
- Check-in type (48_hour, 7_day, manual)
- Campaign stats at time of check-in
- Response tracking

#### `activation_usage_scores`
Tracks usage metrics and calculates engagement score:
- Emails sent, replies received, open rates
- Active campaigns count
- Usage score (0-100)
- Low usage flags

---

### 2. API Endpoints

#### Step 1-2: Decision Capture + Stripe Subscription
**POST** `/api/activation/step-1-2-decision-subscription`

Closes the plan and activates Stripe subscription.

**Request:**
```json
{
  "plan_selected": "growth",
  "workspace_id": "uuid",
  "email": "roofer@example.com",
  "payment_method_id": "pm_xxx",
  "demo_notes": "Notes from demo",
  "activated_by_user_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "step_completed": 2,
  "plan_selected": "growth",
  "stripe_subscription_id": "sub_xxx",
  "message": "Alright, your SmartSend account is now live."
}
```

#### Step 3: Account Creation
**POST** `/api/activation/step-3-account-creation`

Auto-generates account setup (company name, owner, timezone, domain, niche profile).

**Request:**
```json
{
  "workspace_id": "uuid",
  "company_name": "Optional",
  "owner_name": "Optional",
  "default_timezone": "America/Los_Angeles"
}
```

#### Step 4: Foundation Setup
**POST** `/api/activation/step-4-foundation-setup`

Asks 4 questions: city, phone, estimate type, email list.

**Request:**
```json
{
  "workspace_id": "uuid",
  "primary_city": "Tacoma, WA",
  "company_phone": "555-1234",
  "estimate_type": "both",
  "has_email_list": true
}
```

#### Step 5: Import Homeowner List
**POST** `/api/activation/step-5-import-list`

Imports CSV or tracks manual import.

**Request:**
```json
{
  "workspace_id": "uuid",
  "import_method": "csv",
  "contacts_data": [
    {
      "email": "homeowner@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "phone": "555-5678",
      "city": "Tacoma"
    }
  ],
  "contacts_count": 100
}
```

#### Step 6: Launch First Campaign
**POST** `/api/activation/step-6-launch-campaign`

Launches "Homeowner Follow-Up Revival" or "Free Estimate + Inspection" campaign.

**Request:**
```json
{
  "workspace_id": "uuid",
  "campaign_type": "homeowner_followup_revival",
  "contact_ids": ["uuid1", "uuid2"],
  "launch_immediately": true
}
```

---

### 3. Automation Functions

#### Welcome Sequence
**POST** `/api/activation/automation/welcome-sequence`

Sends onboarding instructions and video link after campaign launch.

#### Lead Monitor
**POST** `/api/activation/automation/lead-monitor`

Checks reply count, flags "no replies" within 48 hours, suggests new campaign.

#### Usage Score
**POST** `/api/activation/automation/usage-score`

Tracks sending volume, replies, open rates. Flags low usage and sends "Quick Fix" email.

---

### 4. Check-In Scripts

#### 48-Hour Check-In
**POST** `/api/activation/checkin/48-hour`

Sends message: "Just checked your dashboard — your campaign is live. You should start seeing homeowner replies shortly. Want me to help you respond to the first few leads?"

#### 7-Day Check-In
**POST** `/api/activation/checkin/7-day`

Sends message: "You've had SmartSend running for a week. Your inbox has X replies and Y leads. Ready for me to launch your next campaign?"

---

### 5. Cron Job

**POST** `/api/cron/activation-automation`

Runs daily to:
- Monitor leads (check for no replies after 48 hours)
- Calculate usage scores
- Send 48-hour check-ins
- Send 7-day check-ins

**Setup:**
```bash
# Add to your cron scheduler (e.g., Vercel Cron, GitHub Actions, etc.)
# Run daily at 7 AM UTC
0 7 * * * curl -X POST https://your-domain.com/api/cron/activation-automation \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Usage Flow

### During Demo Close

1. **Decision Capture:**
   ```typescript
   // "Starter, Growth, or Domination — which one should I activate for you?"
   await fetch('/api/activation/step-1-2-decision-subscription', {
     method: 'POST',
     body: JSON.stringify({
       plan_selected: 'growth',
       workspace_id: workspaceId,
       email: rooferEmail,
       payment_method_id: stripePaymentMethodId,
     }),
   });
   ```

2. **Account Creation (Automatic):**
   ```typescript
   await fetch('/api/activation/step-3-account-creation', {
     method: 'POST',
     body: JSON.stringify({ workspace_id: workspaceId }),
   });
   ```

3. **Foundation Setup:**
   ```typescript
   await fetch('/api/activation/step-4-foundation-setup', {
     method: 'POST',
     body: JSON.stringify({
       workspace_id: workspaceId,
       primary_city: 'Tacoma, WA',
       company_phone: '555-1234',
       estimate_type: 'both',
       has_email_list: true,
     }),
   });
   ```

4. **Import List:**
   ```typescript
   await fetch('/api/activation/step-5-import-list', {
     method: 'POST',
     body: JSON.stringify({
       workspace_id: workspaceId,
       import_method: 'csv',
       contacts_data: csvContacts,
       contacts_count: csvContacts.length,
     }),
   });
   ```

5. **Launch Campaign:**
   ```typescript
   await fetch('/api/activation/step-6-launch-campaign', {
     method: 'POST',
     body: JSON.stringify({
       workspace_id: workspaceId,
       campaign_type: 'homeowner_followup_revival',
       launch_immediately: true,
     }),
   });
   ```

6. **Send Welcome Sequence:**
   ```typescript
   await fetch('/api/activation/automation/welcome-sequence', {
     method: 'POST',
     body: JSON.stringify({ workspace_id: workspaceId }),
   });
   ```

---

## Key Activation Rules

1. **Never let a roofer onboard alone** — They will fail. You walk them through everything.

2. **Launch a campaign before ending the first call** — If they leave without seeing the system run → higher churn.

3. **Make the tool feel DONE FOR THEM** — Roofers buy speed + simplicity, not software.

4. **Show them leads ASAP** — First 48 hours = lifetime value predictor.

---

## Why This Flow Helps Roofers

Roofers get:
- ✅ Booked estimates WITHOUT ads
- ✅ Follow-up done FOR THEM
- ✅ Lead revival without extra work
- ✅ A system that runs while crews are busy
- ✅ Confidence that SmartSend is working

When roofers see SmartSend as a worker, not an app → they stay for years.

---

## Environment Variables

Required:
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_PRICE_STARTER_ID` - Stripe price ID for Starter plan
- `STRIPE_PRICE_GROWTH_ID` - Stripe price ID for Growth plan
- `STRIPE_PRICE_DOMINATION_ID` - Stripe price ID for Domination plan
- `CRON_SECRET` - Secret for protecting cron endpoints
- `NEXT_PUBLIC_APP_URL` - Your app URL (for cron jobs)

---

## Database Functions

### `get_roofer_activation_state(workspace_id UUID)`
Returns activation state for a workspace.

### `calculate_activation_usage_score(workspace_id UUID)`
Calculates usage score (0-100) based on:
- Emails sent (max 40 points)
- Replies received (max 30 points)
- Open rate (max 20 points)
- Active campaigns (max 10 points)

---

## Next Steps

1. **Deploy Migration:**
   ```bash
   supabase db push
   ```

2. **Set Environment Variables:**
   Add Stripe price IDs and cron secret to your environment.

3. **Set Up Cron Job:**
   Configure daily cron job to call `/api/cron/activation-automation`.

4. **Integrate Email Service:**
   Update welcome sequence and check-in endpoints to send actual emails (Resend, SendGrid, etc.).

5. **Build UI Component:**
   Create activation flow wizard UI for sales team to use during demos.

---

## Files Created

- `supabase/migrations/20250130000002_block23541_roofer_activation_flow_v1.sql`
- `app/api/activation/step-1-2-decision-subscription/route.ts`
- `app/api/activation/step-3-account-creation/route.ts`
- `app/api/activation/step-4-foundation-setup/route.ts`
- `app/api/activation/step-5-import-list/route.ts`
- `app/api/activation/step-6-launch-campaign/route.ts`
- `app/api/activation/automation/welcome-sequence/route.ts`
- `app/api/activation/automation/lead-monitor/route.ts`
- `app/api/activation/automation/usage-score/route.ts`
- `app/api/activation/checkin/48-hour/route.ts`
- `app/api/activation/checkin/7-day/route.ts`
- `app/api/cron/activation-automation/route.ts`

---

**Block 23541 Complete** ✅






































