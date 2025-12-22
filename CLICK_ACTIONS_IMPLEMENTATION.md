# Click Actions System Implementation

## Overview

The Click Actions system automatically triggers actions when email recipients click specific links, enabling dynamic email marketing automation. This system can tag contacts, enroll them in follow-up campaigns, or suppress future emails based on click behavior.

## Features

- **Real-time Processing**: Actions are triggered immediately when clicks are tracked
- **Flexible Matching**: URL matching using simple text containment
- **Multiple Action Types**: Tag, follow-up campaign enrollment, and email suppression
- **User-friendly Dashboard**: Simple interface for creating and managing rules
- **Secure**: Row-level security ensures users can only manage their own campaigns

## Database Schema

### Click Actions Table
```sql
create table if not exists public.click_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  match_url text not null,
  action text not null,   -- tag|followup_campaign|suppress
  value text,             -- e.g. tag name, campaign_id to start
  created_at timestamptz default now()
);
```

### Enhanced Contacts Table
```sql
-- Add tags column to contacts table
alter table public.contacts add column if not exists tags jsonb default '[]'::jsonb;

-- Helper function for adding tags
create or replace function public.add_contact_tag(p_email text, p_tag text)
returns void as $$
begin
  update public.contacts
  set tags = case
    when not (tags ? p_tag) then tags || to_jsonb(array[p_tag])
    else tags
  end
  where lower(email) = lower(p_email);
end;
$$ language plpgsql;
```

## API Endpoints

### GET /api/campaigns/[id]/click-actions
Fetch all click actions for a specific campaign.

### POST /api/campaigns/[id]/click-actions
Create a new click action rule.

**Request Body:**
```json
{
  "match_url": "pricing",
  "action": "tag",
  "value": "hot_lead"
}
```

**Action Types:**
- `tag`: Add a tag to the contact
- `followup_campaign`: Enroll in another campaign
- `suppress`: Stop sending emails to this contact

### DELETE /api/campaigns/[id]/click-actions?actionId=[id]
Delete a specific click action rule.

## Click Tracking Integration

The system integrates with the existing click tracking route (`/app/t/c/[cid]/[email]/route.ts`). After recording a click event, it:

1. Looks up all click actions for the campaign
2. Checks if the clicked URL matches any rules
3. Executes the corresponding actions:
   - **Tag**: Calls `add_contact_tag` RPC function
   - **Follow-up Campaign**: Inserts recipient into new campaign queue
   - **Suppress**: Adds email to suppression list

## Dashboard Interface

### Location
`/dashboard/campaigns/[id]/click-actions`

### Features
- **Add New Rule**: Form with URL matching, action type, and value fields
- **Rule Management**: View, edit, and delete existing rules
- **Visual Indicators**: Icons and descriptions for each action type
- **Help Text**: Clear explanation of how the system works

### Navigation
Added to campaign page with tabs for:
- Overview
- Analytics  
- **Click Actions** (new)
- Settings

## Usage Examples

### 1. Tag Hot Leads
**Rule**: If URL contains "pricing" → Tag as "hot_lead"
- **Match URL**: `pricing`
- **Action**: `tag`
- **Value**: `hot_lead`

**Result**: When someone clicks a pricing link, they're automatically tagged as a hot lead.

### 2. Follow-up Campaign
**Rule**: If URL contains "demo" → Enroll in "Demo Follow-up" campaign
- **Match URL**: `demo`
- **Action**: `followup_campaign`
- **Value**: `campaign-uuid-here`

**Result**: Clickers are automatically added to the follow-up campaign's recipient list.

### 3. Suppress Uninterested
**Rule**: If URL contains "unsubscribe" → Suppress future emails
- **Match URL**: `unsubscribe`
- **Action**: `suppress`
- **Value**: (not needed)

**Result**: Clickers are added to the suppression list and won't receive future emails.

## Testing

### Manual Testing
1. Create a campaign with tracked links
2. Set up click action rules
3. Send test emails
4. Click the links and verify actions are triggered

### Automated Testing
Run the test script:
```bash
cd scripts
tsx test-click-actions.ts
```

**Note**: Update the `user_id` in the test script with a real user ID from your database.

## Security Considerations

- **Row-level Security**: Users can only access click actions for campaigns they own
- **Input Validation**: Action types are restricted to predefined values
- **Campaign Ownership**: Follow-up campaigns must belong to the same user
- **Rate Limiting**: Consider adding rate limiting for API endpoints in production

## Performance Considerations

- **Indexing**: `campaign_id` is indexed for fast lookups
- **Batch Processing**: Actions are processed one at a time (could be optimized for high-volume scenarios)
- **Caching**: Consider caching click actions for frequently accessed campaigns

## Future Enhancements

- **Advanced URL Matching**: Regex patterns, exact matches, domain restrictions
- **Conditional Logic**: Multiple conditions (e.g., "if clicked pricing AND is from company.com")
- **Action Sequences**: Chain multiple actions together
- **Analytics**: Track which actions are most effective
- **A/B Testing**: Test different action strategies

## Troubleshooting

### Common Issues

1. **Tags not being added**: Check if the `add_contact_tag` function exists and the contact email matches exactly
2. **Follow-up campaign not working**: Verify the campaign ID exists and belongs to the same user
3. **Suppression not working**: Check if the `suppression_emails` table exists and has the correct schema

### Debug Mode
Enable logging in the click tracking route to see which actions are being processed:
```typescript
console.log("Processing click action:", action);
console.log("URL matches:", url.includes(action.match_url));
```

## Migration Notes

This implementation adds new tables and columns to your existing database. The migration is designed to be safe and non-destructive:

- Tables are created with `if not exists`
- Columns are added with `if not exists`
- Existing data is preserved
- RLS policies are applied for security

Run the migration in your Supabase dashboard or via the CLI:
```bash
supabase db push
``` 