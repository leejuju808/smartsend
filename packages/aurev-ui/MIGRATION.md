# Migration Guide: From Local Components to @aurev/ui

This guide shows how to migrate from local UI components to the shared `@aurev/ui` package.

## Before (Local Import)

```tsx
// src/app/dashboard/page.tsx
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

export function Dashboard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <Badge>New</Badge>
      </CardHeader>
      <Button>Get Started</Button>
    </Card>
  );
}
```

## After (Using @aurev/ui)

```tsx
// src/app/dashboard/page.tsx
import { Button } from "@aurev/ui";
import { Card, CardHeader, CardTitle } from "@aurev/ui";
import { Badge } from "@aurev/ui";

export function Dashboard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
        <Badge label="New" />
      </CardHeader>
      <Button variant="primary">Get Started</Button>
    </Card>
  );
}
```

## Component API Differences

### Button

**Before:**
- `variant`: `"default" | "secondary" | "outline" | "ghost" | "link"`
- Uses `bg-primary` (shadcn style)

**After:**
- `variant`: `"primary" | "secondary" | "outline" | "ghost"`
- Uses `bg-brand-gold` (AUREV gold branding)
- Primary variant now uses gold (`#FFD700`) instead of generic primary color

### Card

**Before:**
- Uses `bg-card` and `text-card-foreground`
- Generic shadow

**After:**
- Uses `bg-surface` (`#121212`) with `border-gray-800`
- Adds `shadow-soft` (gold glow effect)
- Better contrast for dark theme

### Badge

**Before:**
- Takes `children` directly
- Variants: `"default" | "secondary" | "destructive" | "outline"`

**After:**
- Accepts `label` prop or `children`
- Variants: `"default" | "gold" | "outline"`
- Default variant uses gold accent with transparency

## Step-by-Step Migration

1. **Install the package** (already done in root `package.json`)

2. **Update imports** in one file at a time:
   ```bash
   # Find all Button imports
   grep -r "@/components/ui/Button" src/
   
   # Replace with @aurev/ui
   ```

3. **Update variant names**:
   - Button: `variant="default"` → `variant="primary"`
   - Badge: Check variant names match new API

4. **Test each component**:
   - Verify styling matches AUREV brand
   - Check dark mode appearance
   - Ensure hover/focus states work

5. **Remove old components** (after all apps migrated):
   ```bash
   rm -rf src/components/ui/Button.tsx
   rm -rf src/components/ui/Card.tsx
   rm -rf src/components/ui/badge.tsx
   ```

## Example: SmartSend Dashboard Migration

### File: `src/app/dashboard/page.tsx`

**Before:**
```tsx
import { Button } from "@/components/ui/Button";

<Button className="bg-black text-white hover:bg-gray-800">
  Import Leads
</Button>
```

**After:**
```tsx
import { Button } from "@aurev/ui";

<Button variant="primary">
  Import Leads
</Button>
```

The gold primary button automatically provides the AUREV brand styling.

## Apps to Migrate

- [ ] SmartSend (root `src/` directory)
- [ ] OpsGrid (`apps/opsgrid/`)
- [ ] AgentCloud (`apps/agentcloud/`)
- [ ] HQ (`apps/hq/`)

## Benefits After Migration

✅ **Consistent branding** across all products  
✅ **3× faster** feature development  
✅ **Enterprise-ready** UI that builds trust  
✅ **Single source of truth** for design tokens  
✅ **Easy theming** updates across entire ecosystem









