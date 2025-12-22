# Demo Mode Implementation

This document describes the public demo mode feature that allows visitors to explore SmartSend without signing up.

## Overview

Demo mode creates a sandbox environment with fake data that visitors can explore in read-only mode. Users can access the demo by clicking "Try Live Demo" on the landing page, which redirects them to the dashboard with a demo session cookie.

## Components

### 1. Database Setup
- **Migration**: `supabase/migrations/20250120000000_demo_mode_setup.sql`
- Creates demo organization (`00000000-0000-0000-0000-000000000001`)
- Seeds demo data: campaigns, leads, threads
- Run this migration in your Supabase SQL editor

### 2. Demo Route
- **File**: `src/app/demo/route.ts`
- Sets `demo_session` cookie with demo user info
- Redirects to `/dashboard`
- Cookie expires in 24 hours

### 3. Middleware Protection
- **File**: `middleware.ts`
- Checks for `demo_session` cookie before Supabase auth
- Allows demo users to access protected routes

### 4. Landing Page
- **File**: `src/app/page.tsx`
- Public marketing page with features and CTAs
- "Try Live Demo" → `/demo`
- "Upgrade to Pro" → `/dashboard/settings/billing`

### 5. Demo Mode Detection

**Client-side**:
```typescript
import { isDemoMode } from "@/lib/demo-mode";
import { useDemoMode } from "@/hooks/useDemoMode";

// In client components
const isDemo = useDemoMode();
if (isDemo) {
  // Disable write actions
}
```

**Server-side**:
```typescript
import { preventDemoModeWrites, throwIfDemoMode } from "@/lib/demo-mode-guard";

// In API routes / server actions
const guard = await preventDemoModeWrites();
if (guard.blocked) {
  return NextResponse.json({ error: guard.reason }, { status: 403 });
}

// Or throw directly
await throwIfDemoMode();
```

### 6. Demo Banner
- **Component**: `src/components/demo/DemoBanner.tsx`
- Shows amber banner at top of dashboard
- Auto-detects demo mode via cookie
- Already integrated into `src/app/dashboard/layout.tsx`

## Read-Only Enforcement

To disable write actions in demo mode, use the provided utilities:

### In Client Components
```typescript
import { useDemoModeGuard } from "@/hooks/useDemoMode";

function MyComponent() {
  const { disabled, title } = useDemoModeGuard();
  
  return (
    <button disabled={disabled} title={title}>
      Send Email
    </button>
  );
}
```

### In API Routes
```typescript
import { preventDemoModeWrites } from "@/lib/demo-mode-guard";

export async function POST(req: Request) {
  const guard = await preventDemoModeWrites();
  if (guard.blocked) {
    return NextResponse.json({ error: guard.reason }, { status: 403 });
  }
  // ... proceed with write action
}
```

## Testing

1. Visit homepage: `http://localhost:3000`
2. Click "Try Live Demo"
3. Should redirect to `/dashboard` with demo banner visible
4. Try to send/delete/invite - actions should be disabled with tooltips

## Customization

- Demo org ID: `00000000-0000-0000-0000-000000000001` (change in migration and demo route)
- Demo user ID: `demo-user`
- Cookie name: `demo_session`
- Banner styling: Edit `src/components/demo/DemoBanner.tsx`

