# Block 401 — Sequence Templates Library v1 Implementation

## ✅ Implementation Complete

This block creates the foundation of SmartSend's Sequence Templates Library, allowing users to:
- Pick a multi-step outreach bundle
- Click "Import to campaign"
- Auto-generate steps, timings, template content, send windows, CTA structure, and follow-up rules

## 📁 Files Created

### Database (2 files)
1. **`supabase/migrations/20250131000000_sequence_templates.sql`**
   - Creates `sequence_templates` table
   - Creates `sequence_template_steps` table
   - Sets up RLS policies (read-only for all users, admin-only inserts)
   - Adds indexes for performance

2. **`supabase/seed/sequence_templates_v1.sql`**
   - Seeds the "SMB Warm Outreach — 4 Step" template
   - Includes 4 steps with proper delays and template variables

### API Routes (2 files)
3. **`src/app/api/templates/sequences/route.ts`**
   - `GET /api/templates/sequences`
   - Fetches all sequence templates with their steps
   - Returns templates grouped with steps

4. **`src/app/api/templates/sequences/import/route.ts`**
   - `POST /api/templates/sequences/import`
   - Imports a template into a campaign
   - Verifies campaign ownership
   - Maps template steps to campaign_steps structure
   - Replaces existing campaign steps

### Frontend (1 file)
5. **`src/app/(dashboard)/templates/page.tsx`**
   - Templates library page showing all available templates
   - Preview modal showing all steps with timings, subjects, and body previews
   - Import functionality with campaign ID selection
   - Uses SWR for data fetching
   - Responsive grid layout

## 🗄️ Database Schema

### `sequence_templates`
- `id` (uuid, primary key)
- `name` (text, unique, not null)
- `description` (text)
- `persona` (text) - e.g., "SMB", "Founder", "Agency"
- `created_at` (timestamptz)

### `sequence_template_steps`
- `id` (uuid, primary key)
- `template_id` (uuid, references sequence_templates)
- `step_number` (int, not null)
- `delay_hours` (int, not null) - hours after previous step
- `subject` (text)
- `body` (text)
- `created_at` (timestamptz)
- Unique constraint: `(template_id, step_number)`

## 🔌 API Endpoints

### GET `/api/templates/sequences`
Returns all templates with their steps:
```json
{
  "templates": [
    {
      "id": "uuid",
      "name": "SMB Warm Outreach — 4 Step",
      "description": "4-step warm outreach optimized for SMB owners.",
      "persona": "SMB",
      "created_at": "2025-01-31T...",
      "steps": [
        {
          "id": "uuid",
          "step_number": 1,
          "delay_hours": 0,
          "subject": "Quick question about {{business}}",
          "body": "Hi {{first_name}},\n\nHad a quick idea about {{business}}…"
        },
        ...
      ]
    }
  ]
}
```

### POST `/api/templates/sequences/import`
Imports a template into a campaign:
```json
{
  "template_id": "uuid",
  "campaign_id": "uuid"
}
```

Response:
```json
{
  "success": true,
  "imported_steps": 4
}
```

## 🎨 UI Features

### Templates Library Page (`/templates`)
- Grid layout showing all templates
- Each template card displays:
  - Template name
  - Description
  - Persona badge
  - Number of steps
  - "Preview Steps" button
  - "Import to Campaign" button

### Preview Modal
- Shows all steps in sequence
- Displays timing information (delay after previous step)
- Shows subject line and body preview
- Scrollable for long templates

### Import Flow
- User clicks "Import to Campaign"
- Prompts for campaign ID (v1 - can be enhanced with campaign selector)
- Imports all steps into the campaign
- Redirects to campaign steps page on success

## 📝 Template Variables (v1)

Supported variables that are replaced at send-time:
- `{{first_name}}`
- `{{last_name}}`
- `{{company}}`
- `{{business}}`
- `{{value_prop}}`

## 🚀 Deployment Steps

1. **Apply Database Migration**
   ```bash
   # Run in Supabase SQL Editor or via migration tool
   supabase/migrations/20250131000000_sequence_templates.sql
   ```

2. **Seed Initial Templates**
   ```bash
   # Run in Supabase SQL Editor
   supabase/seed/sequence_templates_v1.sql
   ```

3. **Verify API Routes**
   - Test `GET /api/templates/sequences` returns templates
   - Test `POST /api/templates/sequences/import` with valid template_id and campaign_id

4. **Access Templates Page**
   - Navigate to `/templates` in the dashboard
   - Should see "SMB Warm Outreach — 4 Step" template
   - Test preview and import functionality

## 🧪 Testing Checklist

- [ ] Database migration applies successfully
- [ ] Seed data loads correctly
- [ ] Templates API returns templates with steps
- [ ] Import API validates campaign ownership
- [ ] Import API creates campaign_steps correctly
- [ ] Templates page loads and displays templates
- [ ] Preview modal shows all steps correctly
- [ ] Import flow works end-to-end
- [ ] Template variables are preserved in imported steps

## 🔮 Future Enhancements

- Campaign selector dropdown instead of prompt
- More template bundles (Founder, Agency, etc.)
- Template categories/filtering
- Template ratings/reviews
- Custom template creation
- Template versioning
- Template analytics (usage, performance)
- Bulk import to multiple campaigns

## 📚 Related Files

- Campaign steps structure: `supabase/migrations/20251211_campaign_steps.sql`
- Campaign steps API: `src/app/api/campaigns/steps/save/route.ts`
- Campaign creation: `app/api/campaigns/route.ts`



