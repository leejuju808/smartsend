# Block 10900 — Quick Start Guide

## 🚀 Deploy in 3 Steps

### Step 1: Apply Database Migration

```bash
# Option 1: Via Supabase CLI
supabase migration up

# Option 2: Via Supabase Dashboard
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy contents of: supabase/migrations/20250130000002_block_10900_roofing_templates.sql
# 3. Run the SQL
```

This creates:
- `templates_campaigns` table
- `templates_snippets` table
- Seeds 9 campaign templates
- Seeds 20+ snippets across 5 categories

### Step 2: Verify Templates Are Loaded

```sql
-- Check templates
SELECT title, category, jsonb_array_length(steps) as step_count 
FROM templates_campaigns 
ORDER BY category;

-- Check snippets
SELECT category, count(*) as count 
FROM templates_snippets 
GROUP BY category;
```

You should see:
- 9 campaign templates
- 20+ snippets across 5 categories

### Step 3: Test the UI

1. Navigate to `/templates` in your app
2. You should see all 9 templates in a grid
3. Click "Preview" to see full sequence
4. Click "Use Template" to create a campaign

## ✅ Verification Checklist

- [ ] Migration applied successfully
- [ ] Templates visible at `/templates`
- [ ] Can preview template steps
- [ ] "Use Template" creates campaign
- [ ] Campaign has all steps from template
- [ ] Snippets visible in Snippets tab
- [ ] Personalization tokens (`{{opener}}`, etc.) present in templates

## 🧪 Test Template Clone

```bash
curl -X POST http://localhost:3000/api/templates/clone-to-campaign \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{
    "templateId": "template-uuid-here",
    "campaignName": "Test Campaign"
  }'
```

Should return:
```json
{
  "success": true,
  "campaignId": "campaign-uuid",
  "steps": 3,
  "next": "/campaigns/campaign-uuid"
}
```

## 📖 Usage Examples

### Browse Templates
```
GET /api/templates/campaigns
```

### Get Specific Template
```
GET /api/templates/campaigns/{id}
```

### Get Snippets
```
GET /api/templates/snippets
```

### Clone Template to Campaign
```
POST /api/templates/clone-to-campaign
{
  "templateId": "uuid",
  "campaignName": "My Campaign"
}
```

## 🎯 What Users See

1. **Templates Page** (`/templates`)
   - Grid of 9 roofing templates
   - Category filters
   - Search functionality
   - Preview modal

2. **Template Card**
   - Title and description
   - Category badge
   - Step count
   - "Preview" and "Use Template" buttons

3. **Preview Modal**
   - All steps shown in sequence
   - Subject and body for each step
   - Delay days displayed
   - "Use Template" button

4. **Snippets Tab**
   - Snippets grouped by category
   - Searchable
   - Ready to copy/paste

## 🔧 Troubleshooting

### Templates Not Showing
- Check RLS policies are applied
- Verify user has org membership (if using org-specific templates)
- Check browser console for errors

### Clone Fails
- Verify campaign creation permissions
- Check workspace_id exists for user
- Verify campaign_steps table exists

### Personalization Tokens Not Working
- Ensure Block 10400 (Personalization Engine) is deployed
- Check tokens match: `{{opener}}`, `{{local_reference}}`, `{{roof_context}}`

## 📚 Related Blocks

- **Block 10400** - Smart Personalization Engine (fills tokens)
- **Campaign Builder** - Where templates are cloned to
- **Campaign Steps System** - Stores multi-step sequences

## 🎉 Success!

Once deployed, roofing companies can:
- ✅ Start sending immediately with proven sequences
- ✅ Use industry-tone messaging without writing
- ✅ Access snippets for quick message building
- ✅ Preview full multi-step flows before using

This makes SmartSend feel "out of the box ready" for roofers!





























































