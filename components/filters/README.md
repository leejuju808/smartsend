# Saved Filters Integration Guide

This guide shows how to integrate the Saved Filters system (Block 220) into your pages.

## Components

- `FilterBuilder` - UI component for building filters
- `SaveFilterModal` - Modal for saving filters
- `SavedFilterSelector` - Dropdown for selecting saved filters
- `applyFiltersToQuery` - Utility function for applying filters to Supabase queries

## Basic Integration Example

```tsx
"use client";

import { useState } from "react";
import { FilterBuilder, FilterState } from "@/components/filters/filter-builder";
import { SaveFilterModal } from "@/components/filters/save-filter-modal";
import { SavedFilterSelector } from "@/components/filters/saved-filter-selector";
import { Button } from "@/components/ui/button";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export function MyPage() {
  const [filter, setFilter] = useState<FilterState>({});
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentWorkspaceId().then(setWorkspaceId);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <SavedFilterSelector
          context="leads"
          setFilter={setFilter}
        />
        <Button onClick={() => setShowSaveModal(true)}>
          Save Filter
        </Button>
      </div>

      <FilterBuilder
        filter={filter}
        setFilter={setFilter}
        workspaceId={workspaceId || undefined}
      />

      <SaveFilterModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        filter={filter}
        context="leads"
        workspaceId={workspaceId || undefined}
        onSaved={() => {
          // Refresh saved filters list
          window.location.reload();
        }}
      />
    </div>
  );
}
```

## API Route Integration

To apply filters in your API routes, use the `applyFiltersToQuery` utility:

```typescript
import { applyLeadsFilters } from "@/lib/filters/apply-filters";
import { FilterState } from "@/components/filters/filter-builder";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const filterJson = req.nextUrl.searchParams.get("filter");
  const filter: FilterState = filterJson ? JSON.parse(filterJson) : {};

  let query = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  // Apply saved filters
  query = applyLeadsFilters(query, filter);

  const { data, error } = await query;
  // ... rest of handler
}
```

## Filter State Format

```typescript
type FilterState = {
  tags?: string[];           // Array of tag IDs
  stage_id?: string;          // Stage UUID
  intent?: string;            // Intent type (for inbox)
  opened_min?: number;        // Minimum open count
  replied?: boolean;          // Has replied
  clicked?: boolean;          // Has clicked
  has_linkedin?: boolean;     // Has LinkedIn URL
  no_reply_days?: number;     // No reply in X days
};
```

## Context-Specific Filters

### Inbox Context
- `intent` - Filter by AI-detected intent
- `replied` - Filter by reply status
- `no_reply_days` - Filter by days since last message

### Leads Context
- `tags` - Filter by tags
- `stage_id` - Filter by pipeline stage
- `opened_min` - Filter by minimum opens
- `replied` - Filter by reply status
- `clicked` - Filter by click status
- `has_linkedin` - Filter by LinkedIn presence
- `no_reply_days` - Filter by days since last contact

### Pipeline Context
- Same as Leads context

### Campaigns Context
- `opened_min` - Filter by minimum opens
- `clicked` - Filter by click status

## Example: Full Page Integration

See `components/filters/example-integration.tsx` for a complete example.










