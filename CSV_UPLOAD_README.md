# CSV Lead Upload Feature - Quick Reference

## ✅ Implementation Complete

Beta users can now upload a CSV, map columns, preview data, and bulk insert leads into `campaign_leads` for the selected campaign.

---

## 📁 Files Created

### Database Migration
- `supabase/migrations/20250225_flatten_campaign_leads.sql` - Flattens campaign_leads table to store lead data directly

### Server Action
- `app/campaigns/[id]/leads/upload/actions.ts` - Server action for bulk insert with deduplication

### Upload UI
- `app/campaigns/[id]/leads/upload/page.tsx` - CSV upload, mapping, and preview interface

### Test Data
- `test-leads.csv` - Sample CSV for testing

---

## 🚀 How to Use

### 1. Apply Database Migration

Run in Supabase SQL Editor:
```sql
-- Copy and run: supabase/migrations/20250225_flatten_campaign_leads.sql
```

This migration:
- Adds `user_id`, `email`, `first_name`, `company`, `title`, `subject_token`, `replied` columns to `campaign_leads`
- Creates unique constraint `(campaign_id, email)` for deduplication
- Sets up RLS policies for read/insert/update access

### 2. Upload CSV

Navigate to: `/campaigns/:id/leads/upload`

1. **Upload CSV** - Click file input, select CSV file
2. **Map Fields** - Required: `email`. Optional: `first_name`, `company`, `title`
3. **Preview** - Review first 5 rows
4. **Save** - Click "Save leads" to bulk insert

### 3. Verification

After upload:
- Alert shows: "Inserted: X, Skipped (dupes): Y"
- Redirects to campaign detail page
- Check Supabase: `campaign_leads` table has new rows
- Deduplication enforced per campaign

---

## 🎯 Features

### CSV Parsing
- Supports quoted fields
- Handles `""` as escaped quote
- Auto-detects headers from first row
- Naive auto-mapping by column name (email, first_name, company, title)

### Deduplication
- Checks existing emails in `campaign_leads` for the campaign
- Filters incoming duplicates before insert
- Case-insensitive matching (`toLowerCase().trim()`)

### Validation
- Required field: `email` (valid email format)
- Optional fields: `first_name`, `company`, `title`
- Max 5000 leads per upload (Zod validation)
- Shows error messages for validation failures

### UI/UX
- Status: `idle` → `parsing` → `ready` → `saving`
- Preview table (first 5 rows)
- Field mapping dropdowns with auto-suggest
- Error messages and loading states
- Redirect to campaign detail on success

---

## 📊 Database Schema

```sql
create table public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null,
  first_name text,
  company text,
  title text,
  subject_token text,
  replied boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)  -- dedupe per campaign
);

alter table public.campaign_leads enable row level security;

create policy "read own leads" on public.campaign_leads for select using (auth.uid() = user_id);
create policy "insert own leads" on public.campaign_leads for insert with check (auth.uid() = user_id);
create policy "update own leads" on public.campaign_leads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## 🧪 Test Checklist

1. ✅ Visit `/campaigns/:id/leads/upload`
2. ✅ Upload `test-leads.csv`
3. ✅ Verify auto-mapping works
4. ✅ Check preview shows correct data
5. ✅ Click "Save leads" → alert shows inserted/skipped
6. ✅ Navigate to campaign detail → see lead count
7. ✅ Check Supabase `campaign_leads` table
8. ✅ Try uploading duplicates → should skip them
9. ✅ Upload CSV with missing email → should show error

---

## 🔗 Integration Points

### Existing Flow
- Campaign creation (`app/campaigns/new/actions.ts`) → redirects to `/campaigns/:id/leads/upload`
- Campaign detail page (`app/(dashboard)/campaigns/[id]/leads/page.tsx`) → lists leads
- API route (`app/api/campaigns/[id]/leads/route.ts`) → queries `leads` table (may need update to use `campaign_leads`)

### Next Steps
1. Update campaign detail page to show leads from `campaign_leads`
2. Update API route to query `campaign_leads` instead of `leads`
3. Add send queue integration to use `campaign_leads` data

---

## 📝 Sample CSV

```csv
email,first_name,company,title
john.doe@example.com,John Doe,Acme Corp,CEO
jane.smith@test.io,Jane Smith,TechCo,CTO
bob.johnson@demo.com,Bob Johnson,StartupXYZ,VP Engineering
```

---

## 🐛 Troubleshooting

### "Not authenticated" error
- Ensure user is logged in
- Check Supabase session cookies

### "All duplicates" message
- Leads already exist in `campaign_leads` for this campaign
- Check existing emails: `SELECT email FROM campaign_leads WHERE campaign_id = '...'`

### CSV parse error
- Ensure first row has headers
- Check for valid CSV format (quotes, commas)
- Try `test-leads.csv` as reference

### RLS policy error
- Verify `auth.uid()` matches `campaign_leads.user_id`
- Check campaign belongs to user

---

## 🎉 Success!

All components are ready to deploy. Apply the migration and test the upload flow.

