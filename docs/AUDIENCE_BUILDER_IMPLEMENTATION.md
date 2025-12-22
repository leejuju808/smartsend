# Audience Builder Implementation

The Audience Builder is a powerful feature that allows users to create dynamic segments of contacts based on various filters, preview the results, save segments for reuse, and integrate them with campaigns.

## Features

- **Dynamic Filtering**: Search contacts by email, name, company, domain, creation date, and more
- **Real-time Preview**: See exactly which contacts match your filters before saving
- **Segment Management**: Save and reuse complex filter combinations
- **Campaign Integration**: Use segments directly in campaign creation
- **Suppression Handling**: Automatically excludes suppressed emails from all queries

## Database Schema

### Contacts Table Enhancements
- Added computed `domain` column (extracted from email)
- Added performance indexes for common filter combinations

### Segments Table
- Stores saved filter definitions as JSONB
- Row-level security ensures users only see their own segments
- Automatic timestamps for creation and updates

## API Endpoints

### `/api/contacts/query`
- **POST**: Query contacts with dynamic filters
- Supports pagination, search, domain filtering, company filtering, date ranges
- Automatically excludes suppressed emails
- Returns preview results with total count

### `/api/segments`
- **GET**: List user's saved segments
- **POST**: Create new segment with filter definition

### `/api/segments/[id]`
- **GET**: Retrieve specific segment by ID

## Usage

### 1. Access the Audience Builder
Navigate to `/dashboard/audience` in your dashboard.

### 2. Build Your Filter
- **Search**: Enter text to search across email, name, company, and domain
- **Domains**: Specify comma-separated domains (e.g., `gmail.com,yahoo.com`)
- **Companies**: Specify comma-separated company names
- **Has Name**: Toggle to only include contacts with first/last names
- **Date Range**: Set creation date boundaries

### 3. Preview Results
Click "Preview" to see which contacts match your current filters. The table shows:
- Email address
- Full name
- Company
- Domain
- Creation date

### 4. Save Segment
- Enter a descriptive name for your segment
- Click "Save Segment" to store the current filter combination
- Saved segments appear in the right sidebar

### 5. Use in Campaigns
- **Direct Use**: Click "Use in Campaign" to go to campaign creation with current filters
- **Saved Segments**: Click "Use" next to any saved segment to load it into campaign creation

## Integration with Campaigns

### URL Parameters
The Audience Builder supports two ways to pass segments to campaigns:

1. **Inline JSON**: `?segment={"q":"acme","domains":["gmail.com"]}`
2. **Segment ID**: `?segment_id=uuid-here`

### Campaign Page Integration
Use the `useLoadedSegment` hook in your campaign creation page:

```typescript
import { useLoadedSegment } from '@/lib/hooks/useLoadedSegment';

function CampaignPage() {
  const segmentFilter = useLoadedSegment();
  
  // Use segmentFilter to pre-populate campaign audience
  // segmentFilter will contain the filter object or null
}
```

## Technical Details

### Filter Object Structure
```typescript
type Filter = {
  q?: string;                    // Search query
  domains?: string[];            // Array of domains
  companies?: string[];          // Array of company names
  has_name?: boolean;            // Require name fields
  created_from?: string;         // ISO date string
  created_to?: string;           // ISO date string
  limit?: number;                // Page size
  offset?: number;               // Pagination offset
};
```

### Performance Considerations
- Database indexes on `(user_id, domain)`, `(user_id, company)`, and `(user_id, created_at)`
- Computed domain column avoids repeated string parsing
- Pagination limits results to 200 contacts maximum
- Suppression list is loaded once per query

### Security
- Row-level security on segments table
- Users can only access their own segments
- Contact queries respect user_id boundaries

## Testing

1. **Run the migration**: Apply the SQL migration to create tables and indexes
2. **Start the dev server**: `npm run dev`
3. **Visit**: `/dashboard/audience`
4. **Test filters**: Try different combinations of search, domains, companies, etc.
5. **Save segments**: Create and verify segments appear in sidebar
6. **Test campaign integration**: Click "Use in Campaign" to verify URL parameters

## Future Enhancements

- **Advanced Filters**: Engagement metrics, email activity, custom fields
- **Segment Templates**: Pre-built filter combinations for common use cases
- **Bulk Actions**: Apply operations to entire segments
- **Analytics**: Segment performance metrics and insights
- **Export**: Download segment data as CSV
- **Sharing**: Share segments with team members 