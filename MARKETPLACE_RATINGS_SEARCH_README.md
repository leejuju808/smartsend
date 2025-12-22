# Marketplace Ratings + Search Implementation

This document outlines the implementation of ratings and enhanced search functionality for the SmartSend AI template marketplace.

## 🚀 Features Implemented

### 1. Template Ratings System
- **1-5 star rating system** with user-friendly star interface
- **Comment support** for detailed feedback
- **One rating per user per template** (upsert functionality)
- **Real-time rating submission** with immediate feedback

### 2. Enhanced Search & Discovery
- **Full-text search** across template titles and descriptions
- **Tag-based filtering** for precise template discovery
- **Multiple sorting options**:
  - Newest First (default)
  - Most Installed
  - Top Rated
- **Advanced search indexing** with pg_trgm for fuzzy matching

### 3. Template Statistics
- **Average rating display** with rating count
- **Install counter** showing template popularity
- **Price information** (Free/Paid with amount)
- **Cover image support** for visual appeal

## 🗄️ Database Schema

### New Tables
```sql
-- Template ratings
CREATE TABLE public.template_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars int NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, user_id)
);

-- Materialized view for template statistics
CREATE MATERIALIZED VIEW public.mv_template_stats AS
  SELECT t.id as template_id,
         COALESCE(count(i.id),0) as installs,
         COALESCE(avg(r.stars)::numeric(10,2), 0) as avg_stars,
         COALESCE(count(r.id),0) as ratings_count
  FROM public.marketplace_templates t
  LEFT JOIN public.marketplace_installs i ON i.template_id = t.id
  LEFT JOIN public.template_ratings r ON r.template_id = t.id
  GROUP BY t.id;
```

### Indexes & Performance
- **Full-text search indexes** for title and description
- **Rating and install statistics** materialized view
- **Automatic refresh triggers** for real-time stats updates

## 🔌 API Endpoints

### POST `/api/templates/rate`
Submit or update a template rating.

**Request Body:**
```json
{
  "template_id": "uuid",
  "stars": 5
}
```

**Response:**
```json
{
  "ok": true
}
```

### GET `/api/templates`
Enhanced template listing with search, filtering, and sorting.

**Query Parameters:**
- `q` - Search query
- `tags` - Comma-separated tag filter
- `sort` - Sort order (`new`, `installs`, `rating`)
- `limit` - Results limit (1-50)

## 🎨 UI Components

### StarRater Component
- **Interactive star interface** (1-5 stars)
- **Immediate feedback** on rating submission
- **Error handling** with user-friendly messages
- **Responsive design** for mobile and desktop

### Enhanced Template Cards
- **Rating display** with star icons and counts
- **Install statistics** showing popularity
- **Price information** prominently displayed
- **Cover image support** for visual appeal
- **Improved layout** with better information hierarchy

### Advanced Search Interface
- **Search input** for title/description search
- **Tag filtering** for precise discovery
- **Sorting dropdown** with multiple options
- **Clear filters** functionality
- **Responsive grid layout** for all screen sizes

## 🔒 Security & Access Control

### Row Level Security (RLS)
- **Public read access** to ratings and statistics
- **User-specific write access** for rating submissions
- **Cascade deletion** when templates are removed

### Authentication
- **User verification** required for rating submission
- **Session validation** on all protected endpoints
- **Input sanitization** for security

## 🚀 Usage Examples

### Submitting a Rating
```typescript
const response = await fetch('/api/templates/rate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    template_id: 'template-uuid',
    stars: 5
  })
});
```

### Searching Templates
```typescript
// Search for sales templates, sorted by rating
const response = await fetch('/api/templates?q=sales&tags=sales&sort=rating');
```

## 🧪 Testing Checklist

- [ ] Submit rating as logged-in user → visible instantly
- [ ] Duplicate rating → updates stars/comment
- [ ] Grid shows ⭐ avg + installs
- [ ] Search filters templates correctly
- [ ] Sort by rating/installs works
- [ ] Clear filters resets all options
- [ ] Responsive design on mobile/desktop
- [ ] Error handling for invalid inputs

## 🔄 Database Migration

Run the migration file to set up the new schema:

```bash
# Apply the migration
supabase db push

# Or run manually in Supabase SQL editor
\i supabase/migrations/20250137_marketplace_ratings_search.sql
```

## 📈 Performance Considerations

- **Materialized view** for fast statistics queries
- **Automatic refresh triggers** for real-time updates
- **Indexed search** for fast template discovery
- **Lazy loading** of template details
- **Fallback queries** for graceful degradation

## 🎯 Future Enhancements

- **Rating analytics** for creators
- **Advanced filtering** by rating range
- **Rating moderation** system
- **Rating trends** and insights
- **Bulk rating operations**
- **Rating export** functionality

## 🐛 Troubleshooting

### Common Issues
1. **Ratings not updating**: Check if materialized view refresh triggers are working
2. **Search not working**: Verify pg_trgm extension is enabled
3. **Permission errors**: Ensure RLS policies are correctly configured
4. **Performance issues**: Check if indexes are properly created

### Debug Commands
```sql
-- Check if materialized view exists
SELECT * FROM public.mv_template_stats LIMIT 5;

-- Verify triggers are working
SELECT * FROM information_schema.triggers WHERE trigger_name LIKE '%template%';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'template_ratings';
```

---

**Implementation Status**: ✅ Complete  
**Last Updated**: January 2025  
**Version**: 1.0.0 