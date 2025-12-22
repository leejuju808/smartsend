# Permissions & Activity Logging System

This system provides role-based permissions and activity logging for the SmartSend application.

## Database Setup

Run the SQL migration to create the required tables:

```sql
-- Run this in Supabase SQL editor
-- File: supabase/migrations/20241220_permissions_activity_log.sql
```

## Components

### 1. Permission Checking (`/src/lib/permissions.ts`)
- `checkPermission(userEmail, workspaceId, action)` - Checks if a user has permission for a specific action
- Actions: "send", "edit", "invite", "manage"
- Roles: "owner", "manager", "member"

### 2. Activity Logging (`/src/lib/log.ts`)
- `logAction(workspaceId, userEmail, action, meta)` - Logs user actions with metadata

### 3. Protected API Route (`/src/app/api/send-protected/route.ts`)
- Example API route that demonstrates permission checking and activity logging
- Wraps the existing send functionality with permission controls

### 4. Activity Feed Component (`/src/components/dashboard/ActivityFeed.tsx`)
- Real-time activity feed that displays recent user actions
- Auto-refreshes every 5 seconds

### 5. Activity API (`/src/app/api/activity/route.ts`)
- API endpoint to fetch activity logs
- Returns the 50 most recent activities

## Usage Examples

### Protecting an API Route
```typescript
import { checkPermission } from "@/lib/permissions";
import { logAction } from "@/lib/log";

export async function POST(req: Request) {
  const { workspace_id, user_email, ...otherData } = await req.json();
  
  try {
    // Check permission
    await checkPermission(user_email, workspace_id, "send");
    
    // Perform action
    // ... your logic here ...
    
    // Log successful action
    await logAction(workspace_id, user_email, "send_email", { 
      recipient: "user@example.com",
      subject: "Test Email" 
    });
    
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.message === "Permission denied") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    throw e;
  }
}
```

### Adding Activity Feed to Dashboard
The ActivityFeed component has been integrated into the main dashboard page and will automatically display recent activity.

## Role Permissions

| Role   | Send | Edit | Invite | Manage |
|--------|------|------|--------|--------|
| owner  | ✅   | ✅   | ✅     | ✅     |
| manager| ✅   | ✅   | ✅     | ❌     |
| member | ✅   | ❌   | ❌     | ❌     |

## Database Schema

### role_permissions
- `role` (text, primary key)
- `can_send` (boolean)
- `can_edit` (boolean) 
- `can_invite` (boolean)
- `can_manage` (boolean)

### activity_log
- `id` (uuid, primary key)
- `workspace_id` (uuid)
- `user_email` (text)
- `action` (text)
- `meta` (jsonb)
- `created_at` (timestamptz)

## Next Steps

1. Run the SQL migration in Supabase
2. Ensure your workspace_members table exists and has the correct structure
3. Test the protected API routes
4. Customize the ActivityFeed component styling as needed
5. Add more permission checks to existing API routes as needed