# Click Actions System - Quick Setup Guide

## 🚀 What We've Built

A powerful click action system that automatically triggers actions when email recipients click specific links:

- **Tag contacts** based on what they click
- **Enroll in follow-up campaigns** automatically  
- **Suppress emails** for uninterested recipients
- **Real-time processing** - actions happen instantly

## 📋 Setup Steps

### 1. Database Setup

You have two options to set up the database:

#### Option A: Use the migration file (Recommended)
```bash
# If you have Supabase CLI installed:
supabase db push

# Or run the migration manually in your Supabase dashboard
```

#### Option B: Manual SQL execution
Copy and paste the SQL from `supabase/migrations/20250121_create_click_actions.sql` into your Supabase SQL editor.

### 2. Verify Installation

The system creates:
- `click_actions` table for storing rules
- `tags` column in `contacts` table  
- `add_contact_tag` function for adding tags
- Proper security policies

### 3. Test the System

Run the test script to verify everything works:
```bash
cd scripts
tsx test-click-actions.ts
```

**Note**: Update the `user_id` in the test script with a real user ID from your database.

## 🎯 How to Use

### 1. Access Click Actions
Navigate to any campaign and click the "Click Actions" tab:
```
/dashboard/campaigns/[campaign-id]/click-actions
```

### 2. Create Your First Rule
Example: Tag people who click pricing links as "hot leads"
- **Match URL**: `pricing`
- **Action**: `tag`  
- **Value**: `hot_lead`

### 3. Test It
Send a campaign with a link containing "pricing", click it, and check if the contact gets tagged!

## 🔧 Troubleshooting

### Common Issues

1. **"Table doesn't exist" errors**
   - Run the database setup SQL first
   - Check if you're in the right database

2. **Tags not being added**
   - Verify the `add_contact_tag` function exists
   - Check if the contact email matches exactly

3. **Permission errors**
   - Ensure RLS policies are enabled
   - Verify the campaign belongs to the current user

### Debug Mode

Add logging to see what's happening:
```typescript
// In src/app/t/c/[cid]/[email]/route.ts
console.log("Processing click action:", action);
console.log("URL matches:", url.includes(action.match_url));
```

## 📚 What's Next?

- **Advanced URL matching** (regex, exact matches)
- **Action sequences** (chain multiple actions)
- **Analytics dashboard** (track rule effectiveness)
- **A/B testing** (test different action strategies)

## 🆘 Need Help?

Check the full documentation in `CLICK_ACTIONS_IMPLEMENTATION.md` or run the test script to verify your setup.

---

**Pro Tip**: Start with simple tag rules to get familiar with the system, then graduate to follow-up campaigns and suppression rules! 