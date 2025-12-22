# Smart Send Analytics Dashboard

A comprehensive analytics dashboard for Smart Send email campaigns, built with Next.js, TypeScript, and Recharts.

## Features

### 📊 Real-time Analytics Dashboard
- **Campaign Performance**: Track sent, opened, clicked, and bounced emails
- **Time Series Charts**: Visualize email activity over time with area charts
- **Campaign Comparison**: Bar charts comparing performance across campaigns
- **Key Metrics Cards**: Quick overview of total metrics with rates

### 🔍 Advanced Filtering
- **Date Ranges**: Filter by last 7 days, 30 days, or 90 days
- **Real-time Updates**: Refresh data on-demand with loading states
- **Responsive Design**: Works on desktop and mobile devices

### 📈 Key Metrics Tracked
- **Total Sent**: Overall email volume
- **Open Rates**: Email open performance with color-coded indicators
- **Click Rates**: Link engagement metrics
- **Bounce Rates**: Email deliverability metrics
- **Campaign Comparison**: Side-by-side performance analysis

## Technical Implementation

### API Endpoint
**File**: `src/app/api/analytics/dashboard/route.ts`

Returns comprehensive analytics data including:
- Date range totals
- Time-bucketed data for charts
- Campaign-specific metrics
- Calculated rates and percentages

### Dashboard Component
**File**: `src/components/SmartSendAnalyticsDashboard.tsx`

Features:
- Interactive charts using Recharts library
- Responsive grid layout
- Loading and error states
- Timeframe selection
- Color-coded performance indicators

### Analytics Page
**File**: `src/app/analytics/page.tsx`

Simple page wrapper that integrates the dashboard component with proper styling.

### Database Schema
**File**: `supabase/migrations/20250121_analytics_schema.sql`

Includes:
- `campaigns` table for campaign management
- `email_events` table for tracking email interactions
- `email_event_buckets` function for time-series data
- `campaign_stats_view` for aggregated campaign metrics
- Row Level Security (RLS) policies for data protection

## Usage

### Accessing the Dashboard
Navigate to `/analytics` in your Smart Send application to view the analytics dashboard.

### Timeframe Selection
Use the timeframe buttons (7d, 30d, 90d) to filter data by different periods.

### Data Interpretation
- **Green indicators**: Good performance (open rate ≥50%, click rate ≥10%)
- **Yellow indicators**: Average performance (open rate 30-49%, click rate 5-9%)
- **Red indicators**: Poor performance (open rate <30%, click rate <5%)

## Mock Data

The current implementation uses mock data as specified in the requirements. To connect to real data:

1. Run the SQL migration to create the database schema
2. Update the `getAnalyticsData` function in the API route to query actual database tables
3. Implement data collection for email events in your email sending logic

## Dependencies

- `recharts`: Chart library for data visualization
- `lucide-react`: Icon library for UI elements
- `@supabase/auth-helpers-nextjs`: Authentication helpers
- `next`: React framework

## Future Enhancements

- Real-time data updates with WebSocket connections
- Export functionality for CSV/PDF reports
- Advanced filtering by campaign type or recipient segments
- A/B testing analytics
- Email deliverability insights
- Integration with external analytics platforms