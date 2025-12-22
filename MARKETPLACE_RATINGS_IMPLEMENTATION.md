# Marketplace Ratings + Search Implementation

This document outlines the implementation of ratings and enhanced search functionality for the SmartSend AI marketplace.

## Features Implemented

### 1. Database Schema
- **`template_ratings`** table for user ratings (1-5 stars + comments)
- **`mv_template_stats`** materialized view for aggregated stats
- **Triggers** to auto-refresh stats when ratings/installs change
- **pg_trgm indexes** for fuzzy search on template names and descriptions

### 2. API Endpoints
- **`POST /api/marketplace/templates/[id]/rating`** - Submit/update rating
- **`GET /api/marketplace/templates/[id]/rating`** - Get template ratings
- **Enhanced `/api/marketplace/templates`** - List with stats and sorting

### 3. UI Components
- **`StarRater`** component for rating templates
- **Enhanced marketplace grid** with ratings display
- **Template detail page** with full ratings interface
- **Search and sort** functionality (by installs, rating, newest)

## Database Migration

Run the SQL migration to set up the ratings system:

```bash
# In Supabase dashboard or via CLI
psql -f supabase/migrations/20250137_marketplace_ratings_search.sql
```

## Usage

### Rating a Template
1. Navigate to template detail page
2. Click stars to rate (1-5)
3. Optionally add a comment
4. Submit rating

### Searching and Sorting
- **Search**: Type in the search box to filter by name/description/tags
- **Sort by**: 
  - Most Installed (default)
  - Top Rated (by average stars)
  - Newest (by creation date)

### Viewing Ratings
- Template cards show average rating and count
- Detail pages show full rating history
- Ratings are public but only authenticated users can rate

## Technical Details

### Materialized View
The `mv_template_stats` view aggregates:
- Install count per template
- Average rating (1-5 stars)
- Total number of ratings

### Triggers
- Auto-refresh stats when ratings change
- Auto-refresh stats when installs change
- Ensures data consistency

### Search Performance
- pg_trgm indexes for fuzzy text search
- Composite indexes for common query patterns
- Efficient filtering and sorting

## Testing

### Manual Testing Checklist
- [ ] Submit rating as logged-in user → visible instantly
- [ ] Duplicate rating → updates stars/comment
- [ ] Grid shows ⭐ avg + installs
- [ ] Search filters templates correctly
- [ ] Sort by rating/installs works
- [ ] Template detail page loads with ratings
- [ ] Back navigation works

### Database Verification
```sql
-- Check ratings table
SELECT * FROM template_ratings LIMIT 5;

-- Check stats view
SELECT * FROM mv_template_stats LIMIT 5;

-- Verify triggers exist
SELECT * FROM information_schema.triggers 
WHERE trigger_name LIKE '%template%';
```

## Future Enhancements

1. **Rating Analytics**: Show rating distribution charts
2. **Review Moderation**: Admin tools for managing inappropriate content
3. **Rating Incentives**: Reward users for leaving helpful ratings
4. **Advanced Search**: Filter by rating range, install count, etc.
5. **Creator Dashboard**: Template owners can see their ratings

## Troubleshooting

### Common Issues

1. **Stats not updating**: Check if triggers are working
   ```sql
   REFRESH MATERIALIZED VIEW mv_template_stats;
   ```

2. **Search not working**: Verify pg_trgm extension is enabled
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

3. **Ratings not showing**: Check RLS policies
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'template_ratings';
   ```

### Performance Monitoring
- Monitor query performance on marketplace page
- Check materialized view refresh frequency
- Optimize indexes if search is slow

## Commit History

```
feat(marketplace): ratings + search + stats
- DB: template_ratings, mv_template_stats, triggers, pg_trgm index
- API: POST /api/templates/[id]/rating, list join with stats
- UI: search/sort, rating control, badges, detail pages
``` 