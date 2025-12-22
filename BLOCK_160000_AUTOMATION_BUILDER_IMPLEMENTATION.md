# Block 160000 — Automation Builder v1 Implementation

## ✅ Implementation Complete

This block implements SmartSend's automation engine, allowing roofers to create workflows that automatically respond to events, send follow-ups, assign leads, and more.

## 📦 What Was Built

### 1. Database Schema ✅

**File:** `supabase/migrations/20250130000001_block160000_automation_builder_v1.sql`

#### Tables Created:

- **`automations`** - Main automation rules
  - `id`, `company_id`, `name`, `description`, `is_active`, `created_at`, `updated_at`

- **`automation_triggers`** - Event triggers
  - `id`, `automation_id`, `event_key` (e.g., "lead.created", "lead.hot", "call.missed")

- **`automation_conditions`** - Conditions that must be met
  - `id`, `automation_id`, `field`, `operator` (=, !=, >, <, contains, etc.), `value`

- **`automation_actions`** - Actions to execute
  - `id`, `automation_id`, `action_key`, `payload` (JSONB), `action_order`

- **`automation_execution_logs`** - Execution history for debugging
  - `id`, `automation_id`, `event_key`, `event_data`, `execution_status`, `error_message`, `executed_actions`

All tables include RLS policies for company-based access control.

### 2. Trigger Dispatcher Edge Function ✅

**File:** `supabase/functions/dispatchAutomation/index.ts`

This is the **HEART** of the automation system. It:

- Listens for events (e.g., "lead.created", "lead.hot", "call.missed")
- Finds matching automations by trigger event key
- Evaluates conditions against event data
- Executes actions in order if conditions pass
- Logs all executions for debugging

**Usage:**
```typescript
// Call from anywhere in your system when an event occurs
await fetch(`${SUPABASE_URL}/functions/v1/dispatchAutomation`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({
    type: "lead.hot",
    data: {
      lead_id: "xxx",
      phone: "+1234567890",
      email: "homeowner@example.com",
      // ... other event data
    },
    company_id: "xxx", // optional, filters automations
  }),
});
```

### 3. Action Executor ✅

The dispatcher includes action executors for:

- **`send_sms`** - Sends SMS via your SMS provider
- **`send_email`** - Sends email (needs integration with your email service)
- **`assign_to_user`** - Assigns lead to a user
- **`schedule_followup`** - Creates a follow-up task
- **`auto_book_appointment`** - Books an appointment automatically
- **`notify_owner`** - Sends notification to company owner
- **`move_to_stage`** - Moves lead to a different pipeline stage

### 4. Pre-Built Automation Templates ✅

**File:** `supabase/migrations/20250130000002_block160000_automation_templates.sql`

Five roofing-specific templates:

1. **Hot Lead Fastlane** - Triggers on `lead.hot`
   - Sends SMS: "We can come today or tomorrow — what works?"
   - Notifies owner
   - Assigns to sales rep

2. **No Response Follow-Up** - Triggers on `lead.no_response_48h`
   - Sends SMS: "Still need help with your roof?"
   - Moves lead to "Follow-Up Needed" stage

3. **Website Lead → SMS First Touch** - Triggers on `lead.created` where `source = website-widget`
   - Sends SMS: "Hey, got your request from the website — what's the full address?"

4. **Missed Call → Text Back** - Triggers on `call.missed`
   - Sends SMS: "Sorry we missed you! Want to schedule a roofing estimate?"

5. **Job Won → Assign Crew** - Triggers on `job.won`
   - Notifies owner about new job
   - Creates crew assignment (action can be extended)

**Function:** `seed_automation_templates_for_company(company_id)` - Seeds all 5 templates for a company.

### 5. API Routes ✅

**Files:**
- `src/app/api/automations/route.ts` - GET (list), POST (create)
- `src/app/api/automations/[id]/route.ts` - GET, PATCH, DELETE
- `src/app/api/automations/templates/route.ts` - POST (seed templates)

### 6. UI ✅

**File:** `src/app/automations/page.tsx`

Features:
- List all automations in a card grid
- Toggle automation on/off
- View trigger, conditions, and actions
- Create new automation
- Load pre-built templates
- Edit and delete automations

## 🚀 Setup Instructions

### 1. Run Database Migrations

```bash
# In Supabase SQL Editor, run:
# 1. supabase/migrations/20250130000001_block160000_automation_builder_v1.sql
# 2. supabase/migrations/20250130000002_block160000_automation_templates.sql
```

Or via CLI:
```bash
supabase db push
```

### 2. Deploy Edge Function

```bash
cd supabase
supabase functions deploy dispatchAutomation
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → dispatchAutomation → Settings:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key

### 4. Integrate Event Triggers

Call the dispatcher whenever events occur in your system:

**Example: When a lead is created:**
```typescript
// In your lead creation code
await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dispatchAutomation`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({
    type: "lead.created",
    data: {
      lead_id: newLead.id,
      email: newLead.email,
      phone: newLead.phone,
      source: newLead.source,
      // ... other lead data
    },
    company_id: companyId,
  }),
});
```

**Example: When a lead becomes hot:**
```typescript
// When lead heat score changes
await fetch(`${SUPABASE_URL}/functions/v1/dispatchAutomation`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({
    type: "lead.hot",
    data: {
      lead_id: lead.id,
      phone: lead.phone,
      email: lead.email,
      heat_score: lead.heat_score,
    },
    company_id: companyId,
  }),
});
```

## 📋 Supported Events

- `lead.created` - New lead created
- `lead.hot` - Lead marked as hot
- `lead.no_response_48h` - Lead hasn't responded in 48 hours
- `call.missed` - Call was missed
- `appointment.booked` - Appointment was booked
- `job.won` - Job was won
- `estimate.completed` - Estimate completed
- (Add more as needed)

## 🎯 Next Steps

1. **Integrate event triggers** throughout your codebase where events occur
2. **Extend action executors** - Add more action types as needed
3. **Build automation builder UI** - Create a visual builder for creating automations
4. **Add more templates** - Create additional roofing-specific templates
5. **Add testing** - Test automations with sample events

## 🔧 Customization

### Adding New Action Types

Edit `supabase/functions/dispatchAutomation/index.ts` and add a new case in the `executeAction` function:

```typescript
case "your_new_action": {
  // Your action logic here
  return { success: true };
}
```

### Adding New Event Types

Just use the new event key when calling the dispatcher. No code changes needed!

## 📊 Monitoring

Check `automation_execution_logs` table to see:
- Which automations ran
- Success/failure status
- Error messages
- Action execution results

## 🎉 Impact

This automation system transforms SmartSend from a tool into a **roofing operating system**. Once roofers build workflows, they become dependent on SmartSend for their daily operations - this is the ultimate retention weapon.


























