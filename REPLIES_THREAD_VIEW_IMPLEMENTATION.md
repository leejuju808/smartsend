# Smart Send — Replies Thread View + Quick Actions Implementation

## Overview
This implementation adds reply triage capabilities to Smart Send, allowing users to mark replies as handled, add internal notes, assign replies to team members, and see visual status indicators.

## Files Created/Modified

### Database Migrations

#### 1. `supabase/migrations/20250201_replies_internal_note.sql`
- Adds `internal_note` column to replies table for tracking notes
- Adds `handled_at` column to track when replies were marked as handled
- Updates `v_replies` view to include new fields
- Creates index on `handled_at` for fast sorting

#### 2. `supabase/migrations/20250202_replies_update_rls.sql`
- Adds RLS policy for updating replies
- Allows authenticated users to update replies for leads in their workspace
- Supports both direct ownership and workspace membership

### API Endpoints

#### 3. `src/app/api/replies/handle/route.ts`
POST endpoint to mark replies as handled
- **Body**: `{ reply_id, internal_note?, assignee? }`
- **Actions**:
  - Sets `status` to "handled"
  - Optionally sets `internal_note`
  - Optionally assigns to `assignee` (defaults to current user)
  - Sets `handled_at` timestamp
- **Returns**: `{ ok: true }` or error

#### 4. `src/app/api/replies/team/route.ts`
GET endpoint to fetch team members
- **Returns**: Array of team members `{ id, name }`
- **Logic**:
  - First tries to get members from user's workspaces
  - Falls back to profiles table if no workspace memberships
- **Use case**: Populate assignee dropdown in UI

### UI Updates

#### 5. `src/app/dashboard/replies/replies.client.tsx`
- Adds `status` field to Row type
- Displays status badges next to subject:
  - "Handled" badge (muted) when `status === 'handled'`
  - "Open" badge (primary) otherwise
- Badges are rendered inline with the subject line

## Database Schema

### Replies Table (New Fields)
```sql
alter table public.replies
  add column if not exists internal_note text,
  add column if not exists handled_at timestamptz,
  add column if not exists status text default 'active' check (status in ('active', 'handled')),
  add column if not exists handled_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now();
```

### View Updates
The `v_replies` view now includes:
- `status` (from replies)
- `internal_note` (from replies)
- `handled_at` (from replies)
- `handled_by` (from replies)
- `updated_at` (from replies)

## RLS Policies

### Select Policy (Already Existed)
```sql
create policy "replies_select_own_leads"
on replies for select
using (exists(select 1 from leads l where l.id = replies.lead_id and l.owner_id = auth.uid()));
```

### Update Policy (New)
```sql
create policy "reply_update_same_workspace" on public.replies
  for update using (
    exists (
      select 1 from public.leads l
      where l.id = replies.lead_id
      and (
        l.owner_id = auth.uid()
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = l.workspace_id
          and wm.user_id = auth.uid()
        )
      )
    )
  );
```

## Usage

### Mark Reply as Handled
```typescript
await fetch('/api/replies/handle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reply_id: 'uuid',
    internal_note: 'Customer needs follow-up',
    assignee: 'user-uuid' // optional
  })
});
```

### Get Team Members
```typescript
const res = await fetch('/api/replies/team');
const { data } = await res.json();
// data = [{ id: 'uuid', name: 'John Doe' }, ...]
```

## Visual Changes

### Status Badges
Replies list now shows inline status badges:
- **Open**: Primary colored badge
- **Handled**: Muted badge

Example:
```
[Email Subject] [Open]  ← Visual indicator
```

## Testing

To test this implementation:

1. **Apply Migrations**:
   ```bash
   # In Supabase or via CLI
   supabase migration up
   ```

2. **Test API Endpoints**:
   ```bash
   # Mark reply as handled
   curl -X POST http://localhost:3000/api/replies/handle \
     -H "Content-Type: application/json" \
     -d '{"reply_id": "your-reply-id"}'
   
   # Get team members
   curl http://localhost:3000/api/replies/team
   ```

3. **Verify UI**:
   - Navigate to `/dashboard/replies`
   - Check that status badges appear
   - Verify badges update when replies are marked as handled

## Notes

- The implementation uses the existing `v_replies` view for data consistency
- RLS policies ensure users can only see/update replies in their workspace
- The team endpoint gracefully falls back if no workspace memberships exist
- All timestamp fields use UTC timezone
- The UI component already exists and was extended with new functionality

## Future Enhancements

Potential next steps:
- Add bulk actions (mark multiple replies as handled)
- Add filters for status (Open/Handled)
- Add sorting by `handled_at`
- Add UI for editing internal notes inline
- Add notification when replies are assigned
- Add activity log for reply actions

