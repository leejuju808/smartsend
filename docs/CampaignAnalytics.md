# Campaign Analytics Component

A comprehensive analytics component for tracking email campaign performance with real-time data from Supabase.

## Features

- **Real-time Analytics**: Track email opens, replies, clicks, bounces, and unsubscribes
- **Performance Metrics**: Calculate open rates, reply rates, click rates, and bounce rates
- **Visual Indicators**: Color-coded performance indicators with trend icons
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Graceful error states with retry functionality
- **Loading States**: Smooth loading animations
- **Customizable**: Multiple display modes (standard, compact, custom styling)

## Components

### CampaignAnalytics

The main analytics component that displays campaign performance metrics.

```tsx
import CampaignAnalytics from '@/components/CampaignAnalytics'

// Basic usage
<CampaignAnalytics />

// Compact mode
<CampaignAnalytics compact />

// Custom styling
<CampaignAnalytics className="border-blue-200 bg-blue-50" />

// Hide refresh button
<CampaignAnalytics showRefresh={false} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `""` | Additional CSS classes |
| `showRefresh` | `boolean` | `true` | Show refresh button |
| `compact` | `boolean` | `false` | Use compact layout |

## Hooks

### useCampaignAnalytics

Custom hook for managing campaign analytics data.

```tsx
import { useCampaignAnalytics } from '@/hooks/useCampaignAnalytics'

function MyComponent() {
  const { stats, loading, error, refresh } = useCampaignAnalytics()
  
  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      <p>Emails sent: {stats.sent}</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  )
}
```

## Services

### CampaignAnalyticsService

Service class for managing campaign analytics data and calculations.

```tsx
import { CampaignAnalyticsService } from '@/lib/campaignAnalytics'

// Get all campaign analytics
const analytics = await CampaignAnalyticsService.getAllCampaignAnalytics()

// Get specific campaign analytics
const campaignAnalytics = await CampaignAnalyticsService.getCampaignAnalytics(campaignId)

// Get aggregated analytics
const aggregated = await CampaignAnalyticsService.getAggregatedAnalytics()

// Track email events
await CampaignAnalyticsService.trackEmailEvent(
  campaignId,
  'user@example.com',
  'opened',
  { ipAddress: '192.168.1.1', userAgent: 'Mozilla/5.0...' }
)
```

## Database Schema

The analytics system uses the following database tables:

### campaigns
- `id` (UUID, Primary Key)
- `name` (VARCHAR)
- `subject` (VARCHAR)
- `content` (TEXT)
- `status` (VARCHAR)
- `sent_at` (TIMESTAMP)
- `user_id` (UUID, Foreign Key)

### campaign_stats
- `id` (UUID, Primary Key)
- `campaign_id` (UUID, Foreign Key)
- `sent` (INTEGER)
- `opened` (INTEGER)
- `replied` (INTEGER)
- `clicked` (INTEGER)
- `bounced` (INTEGER)
- `unsubscribed` (INTEGER)

### email_tracking
- `id` (UUID, Primary Key)
- `campaign_id` (UUID, Foreign Key)
- `recipient_email` (VARCHAR)
- `recipient_name` (VARCHAR)
- `sent_at` (TIMESTAMP)
- `opened_at` (TIMESTAMP)
- `replied_at` (TIMESTAMP)
- `clicked_at` (TIMESTAMP)
- `bounced_at` (TIMESTAMP)
- `unsubscribed_at` (TIMESTAMP)

## Setup

1. **Run Database Migration**:
   ```bash
   # Apply the migration to create the necessary tables
   supabase db push
   ```

2. **Install Dependencies**:
   ```bash
   npm install lucide-react
   ```

3. **Import Components**:
   ```tsx
   import CampaignAnalytics from '@/components/CampaignAnalytics'
   import { useCampaignAnalytics } from '@/hooks/useCampaignAnalytics'
   ```

## Usage Examples

### Basic Dashboard
```tsx
import CampaignAnalytics from '@/components/CampaignAnalytics'

export default function Dashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <CampaignAnalytics />
    </div>
  )
}
```

### With Custom Styling
```tsx
<CampaignAnalytics 
  className="border-2 border-green-200 bg-green-50 rounded-lg shadow-lg"
  compact
/>
```

### In a Tabbed Interface
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CampaignAnalytics from '@/components/CampaignAnalytics'

export default function AnalyticsPage() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="detailed">Detailed</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        <CampaignAnalytics />
      </TabsContent>
      
      <TabsContent value="detailed">
        <CampaignAnalytics compact />
      </TabsContent>
    </Tabs>
  )
}
```

## Performance Benchmarks

The component includes built-in performance benchmarks:

- **Open Rate**: Good (20%+), Average (15%+), Poor (10%+)
- **Reply Rate**: Good (5%+), Average (3%+), Poor (1%+)
- **Click Rate**: Good (2%+), Average (1%+), Poor (0.5%+)
- **Bounce Rate**: Good (≤2%), Average (≤5%), Poor (≤10%)

Performance levels are color-coded:
- 🟢 Excellent/Good (Green)
- 🟠 Average (Orange)
- 🔴 Poor (Red)

## Error Handling

The component handles various error states:

- **Loading State**: Shows skeleton loading animation
- **Network Errors**: Displays error message with retry button
- **No Data**: Shows empty state with helpful message
- **Database Errors**: Graceful fallback to alternative data sources

## Security

- Row Level Security (RLS) enabled on all tables
- Users can only access their own campaign data
- Secure API endpoints with authentication
- Input validation and sanitization

## Contributing

When adding new features:

1. Update the `CampaignAnalyticsService` for new data operations
2. Extend the `CampaignMetrics` interface for new metrics
3. Update the component UI to display new metrics
4. Add appropriate database migrations
5. Update this documentation