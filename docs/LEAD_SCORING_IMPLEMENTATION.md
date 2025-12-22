# Lead Scoring System Implementation

## Overview

The lead scoring system automatically calculates engagement scores for contacts based on their email interactions and tags. This helps sales teams prioritize the hottest leads and focus their efforts on contacts most likely to convert.

## Features

- **Real-time scoring**: Scores update automatically when emails are opened, clicked, or replied to
- **Tag-based bonuses**: Special tags like "hot_lead" add bonus points
- **Dashboard view**: Sortable table showing all contacts ranked by score
- **Automated maintenance**: Nightly score recomputation for data consistency
- **API endpoints**: RESTful API for programmatic access

## Database Schema

### New Column
```sql
-- Add lead_score to contacts table
alter table public.contacts
  add column if not exists lead_score int default 0;

-- Create index for fast queries
create index if not exists idx_contacts_lead_score on public.contacts(lead_score desc);
```

### Scoring Functions

#### 1. Increment Score
```sql
create or replace function public.increment_score(p_email text, p_type text)
returns void as $$
declare pts int := 0;
begin
  if p_type='open' then pts := 1;
  elsif p_type='click' then pts := 3;
  elsif p_type='reply' then pts := 10;
  end if;

  update contacts
  set lead_score = coalesce(lead_score,0) + pts
  where lower(email) = lower(p_email);
end;
$$ language plpgsql;
```

#### 2. Add Tag Bonus
```sql
create or replace function public.add_tag_bonus(p_email text, p_tag text)
returns void as $$
declare bonus int := 0;
begin
  if p_tag='hot_lead' then bonus := 15;
  elsif p_tag='vip' then bonus := 25;
  elsif p_tag='decision_maker' then bonus := 20;
  end if;

  if bonus > 0 then
    update contacts
    set lead_score = coalesce(lead_score,0) + bonus
    where lower(email) = lower(p_email);
  end if;
end;
$$ language plpgsql;
```

#### 3. Recompute All Scores
```sql
create or replace function public.recompute_lead_scores()
returns void as $$
begin
  update contacts c set lead_score = sub.score
  from (
    select e.recipient_email as email,
      (count(*) filter (where e.type='open'))*1 +
      (count(*) filter (where e.type='click'))*3 +
      (count(*) filter (where e.type='reply'))*10 as score
    from email_events e
    group by e.recipient_email
  ) sub
  where lower(c.email) = lower(sub.email);
end;
$$ language plpgsql;
```

## Scoring Rules

### Event Points
- **Email opened**: +1 point
- **Link clicked**: +3 points  
- **Email replied**: +10 points

### Tag Bonuses
- **hot_lead**: +15 points
- **vip**: +25 points
- **decision_maker**: +20 points
- **prospect**: +5 points

### Lead Tiers
- **Hot Lead**: 50+ points (Red)
- **Warm Lead**: 30-49 points (Orange)
- **Qualified Lead**: 15-29 points (Yellow)
- **Engaged Contact**: 5-14 points (Blue)
- **New Contact**: 0-4 points (Gray)

## Implementation Details

### 1. Frontend Components

#### Leads Dashboard (`/dashboard/leads`)
- Sortable table by score, name, company, or date
- Real-time filtering and search
- Visual score indicators with color coding
- Statistics overview (total contacts, hot leads, warm leads, average score)

#### Scoring Library (`/lib/leads/scoring.ts`)
- TypeScript interfaces for scoring rules
- Score calculation functions
- Validation and utility functions
- Score tier and color helpers

### 2. API Endpoints

#### GET `/api/leads`
Returns contacts sorted by lead score (descending)

#### POST `/api/leads/score`
Manually update scores or add tag bonuses:
```json
{
  "email": "user@example.com",
  "action": "increment|add_tag|recompute",
  "points": 5,  // for increment action
  "tag": "hot_lead"  // for add_tag action
}
```

### 3. Event Integration

#### Email Tracking Routes
- **Open tracking** (`/t/o`): Automatically increments score by +1
- **Click tracking** (`/t/c`): Automatically increments score by +3
- **Reply processing** (`/lib/replies.ts`): Automatically increments score by +10

#### Real-time Updates
Scores are updated immediately when events occur, ensuring the dashboard always shows current data.

### 4. Cron Jobs

#### Nightly Score Recomputation
```typescript
// supabase/functions/cron-lead-scoring/index.ts
// Runs nightly to ensure data consistency
await supabase.rpc('recompute_lead_scores');
```

## Setup Instructions

### 1. Database Migration
```bash
# Run the migration to add lead_score column and functions
supabase db push
```

### 2. Deploy Cron Function
```bash
# Deploy the lead scoring cron function
supabase functions deploy cron-lead-scoring
```

### 3. Set Up Cron Schedule
In Supabase dashboard, schedule the cron function to run nightly:
```sql
-- Example: Run at 2 AM daily
SELECT cron.schedule(
  'recompute-lead-scores',
  '0 2 * * *',
  'SELECT cron_lead_scoring();'
);
```

### 4. Test the System
```bash
# Run the test script
npx tsx scripts/test-lead-scoring.ts
```

## Usage Examples

### Manual Score Updates
```typescript
// Add points manually
await fetch('/api/leads/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    action: 'increment',
    points: 5
  })
});

// Add tag bonus
await fetch('/api/leads/score', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    action: 'add_tag',
    tag: 'hot_lead'
  })
});
```

### Programmatic Access
```typescript
import { calculateScore, getScoreTier } from '@/lib/leads/scoring';

const events = {
  opens: 3,
  clicks: 2,
  replies: 1,
  tags: ['hot_lead']
};

const score = calculateScore(events); // Returns 38
const tier = getScoreTier(score); // Returns "Warm Lead"
```

## Monitoring and Maintenance

### Daily Operations
- Monitor dashboard for new hot leads
- Review score distribution and trends
- Check for any scoring anomalies

### Weekly Tasks
- Review and adjust scoring rules if needed
- Analyze conversion rates by score tier
- Clean up any duplicate or invalid contacts

### Monthly Tasks
- Review cron job logs for any failures
- Analyze scoring rule effectiveness
- Consider adding new tag bonuses or event types

## Troubleshooting

### Common Issues

#### 1. Scores Not Updating
- Check if email tracking pixels are loading
- Verify cron job is running successfully
- Check database function permissions

#### 2. Inconsistent Scores
- Run manual score recomputation
- Check for duplicate email events
- Verify email address matching logic

#### 3. Performance Issues
- Ensure lead_score index exists
- Monitor query performance on large contact lists
- Consider partitioning for very large datasets

### Debug Commands
```sql
-- Check current scores
SELECT email, lead_score FROM contacts ORDER BY lead_score DESC LIMIT 10;

-- Verify functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%score%';

-- Check recent events
SELECT * FROM email_events ORDER BY created_at DESC LIMIT 10;
```

## Future Enhancements

### Phase 2 Features
- **AI-powered scoring**: Machine learning to predict lead quality
- **Custom scoring rules**: User-defined point values and rules
- **Score decay**: Automatic score reduction over time
- **Integration scoring**: Points for CRM activities, meetings, etc.

### Phase 3 Features
- **Predictive analytics**: Forecast conversion probability
- **Behavioral scoring**: Advanced engagement patterns
- **Multi-channel scoring**: Social media, website visits, etc.
- **Automated actions**: Trigger workflows based on score thresholds

## Security Considerations

- All scoring functions use RLS (Row Level Security)
- API endpoints validate user permissions
- Cron functions use service role keys only
- No sensitive data exposed in scoring calculations

## Performance Notes

- Index on `lead_score` ensures fast sorting
- Batch updates for large score recomputations
- Async processing for real-time score updates
- Efficient email address matching with lowercase comparison

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Maintainer**: SmartSend AI Team 