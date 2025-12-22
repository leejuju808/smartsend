# Block 14100 — SmartSend Search v2 Implementation

## Overview

SmartSend Search v2 is a comprehensive search and filter engine that lets roofers find ANY homeowner instantly based on multiple criteria including tags, lead score, neighborhood, storm exposure, pipeline stage, list membership, email status, insulation type, repair keywords, insurance signals, enrichment fields, tasks, and value estimate.

## Features Implemented

### 1. Universal Search Bar
- Search across name, email, city, zip, tags, notes, message text, reply text
- Real-time updates with debouncing
- Keyboard shortcuts (Cmd/Ctrl + K to focus)

### 2. Advanced Filters Drawer (8 Sections)
- **Section 1 — Status**: HOT, WARM, FOLLOW-UP, COLD, NOT INTERESTED
- **Section 2 — Lead Score Range**: Slider (0-100) with quick buttons (70+, 30-69, 0-29)
- **Section 3 — Tags**: Checkbox list with auto-generated tags
- **Section 4 — Neighborhood / City**: Grouped lists for cities and neighborhoods
- **Section 5 — Lists**: Filter by list membership
- **Section 6 — Storm Exposure**: Hail, Wind, Heavy Rain, Freeze
- **Section 7 — Email Activity**: Opened, Not Opened, Hard Bounced, Soft Bounced, Unsubscribed, Complaint
- **Section 8 — Task Status**: Has Tasks, Overdue Tasks, Completed Tasks, No Tasks

### 3. Saved Searches
- Save search presets with name and description
- Share searches with workspace members
- Track usage count and last used date
- One-click load saved searches

### 4. Search Results
- Clean list/grid view with contact cards
- Each card shows: name, email, city, tags, lead score, status, last message preview, pipeline stage, due tasks
- Click to go to Lead Profile

### 5. Global Search (Top Navigation)
- Search across contacts, lists, campaigns, pipeline leads, tags, notes
- Unified search experience

## Files Created

### Database Migration
- `supabase/migrations/20250130000001_block_14100_search_v2.sql`
  - Creates `saved_searches` table
  - Enhances `contacts` table with search indexes
  - Creates `contact_search_view` for optimized queries
  - Creates `search_contacts_v2` RPC function
  - Creates `increment_saved_search_usage` helper function

### API Endpoints
- `src/app/api/search/v2/route.ts` - Main search endpoint with advanced filtering
- `src/app/api/search/saved/route.ts` - CRUD operations for saved searches
- `src/app/api/search/saved/[id]/route.ts` - Update and track usage for saved searches

### Frontend Components
- `src/components/search/SearchInput.tsx` - Universal search bar component
- `src/components/search/AdvancedFiltersDrawer.tsx` - Advanced filters drawer with 8 sections
- `src/components/search/SearchResultsList.tsx` - Search results display component
- `src/components/search/SavedSearchCard.tsx` - Saved search card component
- `src/components/search/SearchV2.tsx` - Main SearchV2 component that ties everything together

## Usage Example

```tsx
import { SearchV2 } from "@/components/search/SearchV2";

export default function ContactsPage() {
  const handleContactClick = (contactId: string) => {
    // Navigate to contact detail page
    router.push(`/contacts/${contactId}`);
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Contacts</h1>
      <SearchV2 onContactClick={handleContactClick} />
    </div>
  );
}
```

## API Usage

### Search Contacts
```typescript
GET /api/search/v2?query=john&filters={"status":["HOT"],"lead_score_min":70}&limit=50&offset=0
```

### List Saved Searches
```typescript
GET /api/search/saved
```

### Create Saved Search
```typescript
POST /api/search/saved
{
  "name": "HOT Storm Leads",
  "description": "High-value storm leads",
  "query": "storm",
  "filters": {
    "status": ["HOT"],
    "lead_score_min": 70,
    "storm_exposure": ["hail", "wind"]
  },
  "is_shared": false
}
```

### Delete Saved Search
```typescript
DELETE /api/search/saved?id={search_id}
```

### Track Usage
```typescript
POST /api/search/saved/{search_id}
```

## Database Schema

### saved_searches Table
- `id` (uuid, primary key)
- `workspace_id` (uuid, foreign key)
- `user_id` (uuid, foreign key)
- `name` (text, required)
- `description` (text, optional)
- `query` (text, optional)
- `filters` (jsonb, required)
- `is_shared` (boolean, default false)
- `usage_count` (integer, default 0)
- `last_used_at` (timestamptz, optional)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### Indexes Created
- `idx_contacts_lead_score` - Fast lead score filtering
- `idx_contacts_pipeline_stage` - Fast pipeline stage filtering
- `idx_contacts_lead_status` - Fast lead status filtering
- `idx_contacts_city` - Fast city filtering
- `idx_contacts_tags_gin` - Fast tag array searches (GIN index)
- `idx_saved_searches_workspace` - Fast workspace queries
- `idx_saved_searches_user` - Fast user queries

## Integration Points

### Contacts Page
Replace existing search with `<SearchV2 />` component:
```tsx
// Before
<input placeholder="Search contacts..." />

// After
<SearchV2 onContactClick={(id) => router.push(`/contacts/${id}`)} />
```

### Inbox Page
Add search bar at top:
```tsx
<SearchV2 
  initialQuery={searchParams.get("q") || ""}
  onContactClick={(id) => router.push(`/contacts/${id}`)}
/>
```

### Pipeline Page
Add search and filters:
```tsx
<SearchV2 
  initialFilters={{ pipeline_stage: ["HOT", "WARM"] }}
  onContactClick={(id) => router.push(`/pipeline/${id}`)}
/>
```

## Performance Considerations

1. **Database Indexes**: All filterable columns have indexes for fast queries
2. **GIN Indexes**: Tags use GIN indexes for fast array searches
3. **View Optimization**: `contact_search_view` pre-joins enrichment and task data
4. **Pagination**: Results are paginated (default 50 per page)
5. **Debouncing**: Search input is debounced (300ms) to reduce API calls

## Future Enhancements

1. **Phone Search**: Add phone number search support
2. **Value Estimate Filter**: Add filter for estimated job value
3. **Repair Keywords**: Add filter for repair-related keywords
4. **Insulation Type**: Add filter for insulation type
5. **Export Results**: Add export functionality for search results
6. **Bulk Actions**: Add bulk actions on search results
7. **Search Analytics**: Track popular searches and filters

## Testing Checklist

- [ ] Search by name, email, city, zip, tags, notes
- [ ] Filter by status (HOT, WARM, etc.)
- [ ] Filter by lead score range
- [ ] Filter by tags
- [ ] Filter by cities and neighborhoods
- [ ] Filter by list membership
- [ ] Filter by storm exposure
- [ ] Filter by email activity
- [ ] Filter by task status
- [ ] Save search preset
- [ ] Load saved search
- [ ] Delete saved search
- [ ] Share saved search
- [ ] Track usage count
- [ ] Pagination works correctly
- [ ] Results display correctly
- [ ] Click contact card navigates to detail page

## Notes

- The search function uses PostgreSQL full-text search capabilities
- RLS (Row Level Security) is enforced on all tables
- All API endpoints require authentication
- Saved searches are workspace-scoped
- Filter combinations are ANDed together (all filters must match)





















































