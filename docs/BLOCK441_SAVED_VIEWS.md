# Block 441 — Saved Filters & Views v1

## Overview

This block implements a comprehensive saved views system for SmartSend, similar to HubSpot, Apollo, and Notion. Users can create, save, and share custom filtered views for Leads, Campaigns, Inboxes, Sequences, Events, and Domains tables.

## Features

✅ Save View (with name)  
✅ Shared views (team-wide)  
✅ Private views (you only)  
✅ Default view  
✅ Duplicate view  
✅ Update view  
✅ Delete view  
✅ Filter + Sort persistence  
✅ Column visibility persistence  
✅ View permissions  
✅ View categories  

## Database Schema

### `saved_views` Table

```sql
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  entity_type text not null check (entity_type in ('leads', 'campaigns', 'inboxes', 'sequences', 'events', 'domains')),
  config jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  is_default boolean not null default false,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Config Structure

```json
{
  "filters": [
    { "field": "score", "operator": ">", "value": 50 },
    { "field": "status", "operator": "=", "value": "engaged" }
  ],
  "sort": [
    { "field": "created_at", "direction": "desc" }
  ],
  "hiddenColumns": ["phone_number", "owner_id"]
}
```

## API Endpoints

### List Views
```
GET /api/saved-views-v2/list?entity_type=leads
```

### Create View
```
POST /api/saved-views-v2/create
Body: {
  name: string,
  entity_type: "leads" | "campaigns" | "inboxes" | "sequences" | "events" | "domains",
  config: { filters, sort, hiddenColumns },
  shared?: boolean,
  is_default?: boolean,
  category?: string
}
```

### Get View
```
GET /api/saved-views-v2/[id]
```

### Update View
```
PUT /api/saved-views-v2/[id]
Body: {
  name?: string,
  config?: object,
  shared?: boolean,
  is_default?: boolean,
  category?: string
}
```

### Delete View
```
DELETE /api/saved-views-v2/[id]
```

### Duplicate View
```
POST /api/saved-views-v2/[id]/duplicate
Body: {
  name?: string
}
```

### Seed Default Views
```
POST /api/saved-views-v2/seed-defaults
```

## Frontend Usage

### React Hooks

```typescript
import { useSavedViews, useCreateSavedView, SavedView } from "@/hooks/useSavedViews";

// Fetch views for an entity type
const { data: views, isLoading } = useSavedViews("leads");

// Create a new view
const createView = useCreateSavedView();
await createView.mutateAsync({
  name: "Hot Leads",
  entity_type: "leads",
  config: {
    filters: [{ field: "score", operator: ">", value: 70 }],
    sort: [{ field: "score", direction: "desc" }],
    hiddenColumns: [],
  },
  shared: true,
});
```

### ViewSelector Component

```typescript
import { ViewSelector } from "@/src/components/saved-views/ViewSelector";

<ViewSelector
  entityType="leads"
  currentViewId={selectedViewId}
  onSelectView={(view) => {
    // Apply view config to your query
    setSelectedViewId(view?.id || null);
  }}
  currentFilters={currentFilters}
  currentSort={currentSort}
  currentHiddenColumns={hiddenColumns}
/>
```

### Applying View Config to Queries

```typescript
import { applyViewConfigToQuery } from "@/src/lib/saved-views/applyViewConfig";
import { useSavedView } from "@/hooks/useSavedViews";

const { data: view } = useSavedView(viewId);
let query = supabase.from("leads").select("*");

if (view) {
  query = applyViewConfigToQuery(query, view);
}

const { data } = await query;
```

## Permissions

- **Owner/Admin**: Can create shared views, edit shared views, set team default views
- **Member**: Can create private views, can create shared views, cannot delete shared views from other users
- **Readonly**: Can view shared views, cannot create or edit

## Default Views

The system includes pre-built default views that can be seeded:

**Leads:**
- Hot Leads (Score > 70 + Interested)
- Engaged Leads (Opened/Clicked/Reply)
- New Leads This Week
- ICP-Fit Leads
- Unqualified Leads
- Needs Follow-Up

**Campaigns:**
- Active Only
- Paused (Auto-Pause)
- Best Performers (Reply > 10%)
- Needs Optimization (Open < 20%)

**Inboxes:**
- Healthy (Score > 80)
- Needs Attention (Score 50–80)
- Critical (Score < 50)

## Migration

Run the migration file:
```bash
supabase/migrations/20250131000000_block441_saved_filters_views_v1.sql
```

## Integration Example

See `src/components/leads/LeadsTable.tsx` for an example of integrating saved views into a table component.

## Next Steps

- Smart Views v2 (AI suggests filters)
- SmartDashboards
- Custom report builder
- Analytics v2
- Niche-specific presets



