# Team Campaign Sharing Integration

This document shows how to integrate the team sharing feature into your campaigns page.

## Usage Example: Add Share Button to Campaigns Header

```tsx
// src/app/dashboard/campaigns/page.tsx
"use client";
import { useState } from "react";
import ShareWorkspaceModal from "@/components/ShareWorkspaceModal"; // or @/components/ShareWorkspaceModal
import { Button } from "@/components/ui/button";

export default function CampaignsHeader({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Campaigns</h1>
      <Button onClick={()=>setOpen(true)} className="text-sm">
        Share Workspace
      </Button>
      <ShareWorkspaceModal 
        workspaceId={workspaceId} 
        open={open} 
        onClose={()=>setOpen(false)} 
      />
    </div>
  );
}
```

## Integration Points

### 1. Database Migration
Run the migration: `supabase/migrations/20251026_team_sharing.sql`

### 2. API Routes
- **Create Invite**: `POST /api/workspaces/invite`
- **Accept Invite**: `POST /api/workspaces/accept`

### 3. Components
The `ShareWorkspaceModal` component is located at `/components/ShareWorkspaceModal.tsx`

### 4. Accept Invite Page
Users will be redirected to `/app/accept-invite/page.tsx` when they click an invite link.

## Features

- **Secure Invites**: Single-use tokens with expiration
- **Role-Based Access**: Owner, Admin, Member roles
- **RLS Policies**: Row-level security on all workspace tables
- **One-Time Use**: Invites are deleted after acceptance
- **Seamless UX**: Instant workspace switching after accepting invite

## Security

- RLS policies enforce workspace isolation
- Only workspace admins/owners can create invites
- Invite tokens expire after 72 hours (configurable)
- Users can only read/write data in workspaces they're members of
