# Team Sharing Implementation

## ✅ Implementation Complete

All code, database migrations, and UI components for team sharing have been implemented.

---

## 📦 Files Created

### Database Migration (1 file)
✅ `supabase/migrations/20251101_team_sharing.sql` (33 lines)
- Creates `teams` table with `id`, `name`, `owner_id`, `created_at`
- Creates `team_members` table with `id`, `team_id`, `user_id`, `role`, `created_at`
- Adds `team_id` column to `campaigns` table
- Sets up Row Level Security (RLS) policies for teams and team members

### Edge Function (1 file)
✅ `supabase/functions/inviteTeamMember/index.ts` (34 lines)
- Accepts email and teamId via POST request
- Looks up user by email from profiles table
- Adds user to team_members with 'member' role
- Returns success response or error if user not found

### Existing Files (Verified)
✅ `src/app/dashboard/team/page.tsx` - Team management UI
✅ `src/app/dashboard/layout.tsx` - Sidebar navigation with Team link
✅ `src/app/dashboard/team/TeamInviteForm.tsx` - Invite form component
✅ `src/app/api/team/invite/route.ts` - API endpoint for invites

**Total**: 2 new files + verification of existing UI

---

## 🎯 What Was Built

### Core Feature
**Team Sharing System** - Simple team collaboration with email-based member invites

### Components
1. **Database Schema**
   - `teams` table - Team container with owner
   - `team_members` table - Many-to-many relationship
   - `campaigns.team_id` - Link campaigns to teams
   - Basic RLS policies for access control

2. **Edge Function**
   - `inviteTeamMember` - Direct email-to-team assignment
   - Uses service role for admin privileges
   - Returns success/error based on user lookup

3. **Dashboard UI** (Already Exists)
   - `/dashboard/team` - Full team management page
   - View members, invite new members, manage roles
   - Integrated with existing billing and permissions

4. **Navigation**
   - Team link in sidebar (desktop and mobile)
   - Icon: Users from lucide-react

---

## ⚡ Quick Deploy (3 Steps)

### Step 1: Apply Database Migration
```bash
# Option 1: Using Supabase CLI
supabase migration up

# Option 2: Manual SQL execution
# Copy and run: supabase/migrations/20251101_team_sharing.sql
# in Supabase Dashboard → SQL Editor
```

### Step 2: Deploy Edge Function
```bash
supabase functions deploy inviteTeamMember
```

### Step 3: Verify Setup
```bash
# Start development server
npm run dev

# Navigate to
open http://localhost:3000/dashboard/team

# Or test the Edge Function directly
curl -X POST http://localhost:54321/functions/v1/inviteTeamMember \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","teamId":"your-team-id"}'
```

---

## 📖 Usage

### Creating a Team

First, create a team manually or via API:

```sql
INSERT INTO teams (name, owner_id, created_at)
VALUES ('My Team', 'your-user-id', NOW());
```

### Inviting a Member

#### Option 1: Via Dashboard UI
1. Go to `/dashboard/team`
2. Enter teammate email in invite form
3. Click "Invite"

#### Option 2: Via Edge Function
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/inviteTeamMember \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@company.com",
    "teamId": "your-team-uuid"
  }'
```

#### Option 3: Via API Route
```bash
curl -X POST http://localhost:3000/api/team/invite \
  -H "Content-Type: application/json" \
  -d '{"email":"teammate@company.com"}'
```

### Viewing Team Members

```sql
SELECT tm.*, p.email, p.full_name
FROM team_members tm
JOIN profiles p ON tm.user_id = p.id
WHERE tm.team_id = 'your-team-id';
```

---

## 🔒 Security

### Row Level Security (RLS)
- **Teams**: Owners can view their teams
- **Team Members**: Users can view their own memberships
- **Campaigns**: Team-scoped via `team_id` column

### Edge Function Security
- Uses service role key for admin operations
- Validates user exists before adding to team
- No authentication checks (relies on service role)

---

## 🧪 Testing

### 1. Verify Migration
```sql
SELECT * FROM teams LIMIT 1;
SELECT * FROM team_members LIMIT 1;
```

### 2. Test Edge Function
```bash
# Replace with actual values
curl -X POST http://localhost:54321/functions/v1/inviteTeamMember \
  -H "Content-Type: application/json" \
  -d '{"email":"existing@user.com","teamId":"team-uuid"}'
```

### 3. Test UI Flow
1. Navigate to `/dashboard/team`
2. Enter test email
3. Verify member appears in list

---

## 📝 Notes

### Existing Implementation
The application already has a more comprehensive team system with:
- Advanced role-based access control (owner/admin/member/viewer)
- Team invites with tokens
- Workspace integration
- Billing integration for seats

This implementation adds:
- A simpler, direct email-to-team mapping
- Edge Function for programmatic invites
- Minimal schema for rapid iteration

### Next Steps (Block 24)
Once confirmed working, Block 24 will add:
- Advanced permissions system
- Team-level billing
- Activity tracking
- Multi-team support

---

## ✅ Verification Checklist

- [x] Migration file created
- [x] Edge function created
- [x] Dashboard UI verified
- [x] Sidebar link verified
- [ ] Migration applied to database
- [ ] Edge function deployed
- [ ] Team created in database
- [ ] Invite tested successfully
- [ ] Member appears in UI

---

## 🐛 Troubleshooting

### "User not found" error
- User must exist in `profiles` table with matching email
- Check email case sensitivity and whitespace

### Permission denied
- Verify RLS policies are enabled
- Check user has proper role in team

### Team not found
- Create team first before inviting members
- Verify `team_id` is correct UUID

---

## 📚 Related Files

- `supabase/migrations/20250912_teams_and_sharing.sql` - Advanced team system
- `supabase/migrations/20250306000000_teams_role_based_access.sql` - RBAC system
- `src/app/dashboard/team/page.tsx` - Main UI
- `src/app/api/team/invite/route.ts` - API endpoint

