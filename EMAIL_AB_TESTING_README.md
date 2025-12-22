# Email A/B Testing System

This document describes the comprehensive A/B testing system implemented for email campaigns and sequences in SmartSend AI.

## Overview

The A/B testing system allows you to:
- Create multiple variants of email campaigns and sequences
- Split traffic randomly between variants
- Track performance metrics per variant (opens, clicks, replies)
- Declare winners based on performance
- Optimize email performance through data-driven decisions

## Features

### ✅ Core Functionality
- **Multi-variant testing**: Support for A/B, A/B/C, and A/B/n testing
- **Traffic splitting**: Configurable traffic allocation (e.g., 50/50, 33/33/34)
- **Real-time tracking**: Monitor opens, clicks, and replies per variant
- **Winner declaration**: Manually declare winners or let the system auto-optimize
- **Campaign & Sequence support**: Works with both single campaigns and multi-step sequences

### ✅ Dashboard & Analytics
- **Centralized dashboard**: `/dashboard/abtest` for overview of all tests
- **Detailed results**: Individual test pages with comprehensive metrics
- **Performance comparison**: Side-by-side variant performance analysis
- **Statistical insights**: Basic significance testing and recommendations

### ✅ Integration
- **Seamless workflow**: Integrates with existing campaign and sequence systems
- **Event tracking**: Automatic variant tracking in email events
- **API endpoints**: RESTful API for programmatic access
- **Database functions**: PostgreSQL functions for variant assignment and winner declaration

## Database Schema

### Tables

#### `ab_tests`
```sql
CREATE TABLE public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_kind text NOT NULL CHECK (parent_kind IN ('campaign', 'sequence')),
  parent_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed')),
  winner_variant_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `ab_variants`
```sql
CREATE TABLE public.ab_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  subject text,
  body_text text,
  body_html text,
  traffic_split int DEFAULT 50 CHECK (traffic_split > 0 AND traffic_split <= 100),
  created_at timestamptz DEFAULT now()
);
```

### Key Functions

#### `get_ab_test_variant(parent_kind, parent_id)`
Returns a randomly selected variant ID based on traffic split weights.

#### `declare_ab_test_winner(test_id, winner_variant_id)`
Marks a variant as the winner and completes the test.

## API Endpoints

### Create A/B Test
```http
POST /api/abtest
Content-Type: application/json

{
  "parent_kind": "campaign",
  "parent_id": "uuid",
  "name": "Subject Line Test",
  "variants": [
    {
      "subject": "Variant A Subject",
      "body_text": "Variant A body",
      "body_html": "<p>Variant A HTML</p>",
      "traffic_split": 50
    },
    {
      "subject": "Variant B Subject", 
      "body_text": "Variant B body",
      "body_html": "<p>Variant B HTML</p>",
      "traffic_split": 50
    }
  ]
}
```

### Get A/B Test Results
```http
GET /api/abtest/{id}/results
```

Returns detailed metrics for each variant:
```json
{
  "success": true,
  "test": { ... },
  "results": [
    {
      "variant": { ... },
      "sent": 100,
      "opens": 25,
      "clicks": 5,
      "replies": 2,
      "open_rate": 25,
      "click_rate": 5,
      "reply_rate": 2
    }
  ]
}
```

## Usage Examples

### 1. Creating an A/B Test for a Campaign

```typescript
// Create A/B test with 2 subject line variants
const response = await fetch('/api/abtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parent_kind: 'campaign',
    parent_id: 'campaign-uuid',
    name: 'Q1 Subject Line Test',
    variants: [
      {
        subject: '🚀 Boost Your Sales This Quarter',
        body_html: '<h1>Boost Your Sales</h1><p>Discover proven strategies...</p>',
        traffic_split: 50
      },
      {
        subject: '💡 Q1 Revenue Optimization Guide',
        body_html: '<h1>Q1 Revenue Guide</h1><p>Learn how top performers...</p>',
        traffic_split: 50
      }
    ]
  })
});
```

### 2. Creating an A/B Test for a Sequence

```typescript
// Create A/B test for sequence step 1
const response = await fetch('/api/abtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parent_kind: 'sequence',
    parent_id: 'sequence-uuid',
    name: 'Follow-up Sequence Test',
    variants: [
      {
        subject: 'Quick follow-up on our conversation',
        body_html: '<p>Hi there, I wanted to follow up...</p>',
        traffic_split: 33
      },
      {
        subject: 'Checking in - any questions?',
        body_html: '<p>Hello! I hope you\'re doing well...</p>',
        traffic_split: 33
      },
      {
        subject: 'Following up - next steps',
        body_html: '<p>Hi! I\'m following up to see...</p>',
        traffic_split: 34
      }
    ]
  })
});
```

### 3. Sending Emails with Variants

When sending emails, the system automatically:
1. Checks for active A/B tests
2. Assigns variants based on traffic split
3. Tracks events with variant IDs

```typescript
// The system automatically handles variant assignment
// Just send your campaign/sequence normally
await sendCampaign(campaignId, contacts);
```

## Dashboard Features

### Main Dashboard (`/dashboard/abtest`)
- Overview of all active and completed A/B tests
- Key metrics: active tests, total sent, average open rate, completed tests
- Quick access to test details and variant management

### Test Results Page (`/dashboard/abtest/{id}`)
- Detailed performance metrics for each variant
- Side-by-side comparison tables
- Statistical significance analysis
- Winner declaration functionality
- Performance recommendations

### Campaign Variants (`/dashboard/campaigns/{id}/variants`)
- Existing campaign variant management
- Thompson Sampling optimization
- Real-time performance tracking

## Best Practices

### 1. Test Design
- **Start simple**: Begin with 2 variants (A/B) before expanding
- **Clear hypothesis**: Know what you're testing and why
- **Sufficient sample size**: Ensure enough data for statistical significance
- **Test duration**: Run tests for at least 1-2 weeks

### 2. Variant Creation
- **One change at a time**: Test subject lines OR body content, not both
- **Meaningful differences**: Make variants distinct enough to measure impact
- **Consistent messaging**: Keep core value proposition consistent across variants

### 3. Traffic Allocation
- **Balanced splits**: Start with 50/50 for A/B tests
- **Equal distribution**: Ensure variants get similar traffic volumes
- **Monitor distribution**: Check that traffic is splitting as expected

### 4. Analysis & Optimization
- **Primary metric**: Focus on reply rate for B2B, open rate for awareness
- **Statistical significance**: Don't declare winners too early
- **Continuous improvement**: Use learnings for future campaigns

## Testing Scenarios

### Subject Line Testing
- **Emoji vs No Emoji**: "🚀 Boost Sales" vs "Boost Sales"
- **Question vs Statement**: "Want to increase revenue?" vs "Increase your revenue"
- **Length variations**: Short vs long subject lines
- **Personalization**: Generic vs personalized subjects

### Content Testing
- **Tone**: Formal vs casual language
- **Structure**: Bullet points vs paragraphs
- **CTA placement**: Top vs bottom of email
- **Social proof**: With vs without testimonials

### Sequence Testing
- **Timing**: 1-day vs 3-day delays
- **Frequency**: Weekly vs bi-weekly follow-ups
- **Content progression**: Different content sequences
- **Conditional logic**: Different paths based on engagement

## Monitoring & Analytics

### Key Metrics to Track
1. **Open Rate**: Email visibility and subject line effectiveness
2. **Click Rate**: Content engagement and CTA effectiveness
3. **Reply Rate**: Ultimate goal for B2B outreach
4. **Conversion Rate**: Business outcome (meetings, sales, etc.)

### Statistical Significance
- **Sample size**: Minimum 100 emails per variant
- **Confidence level**: 95% confidence for reliable results
- **Duration**: Account for day-of-week and time-of-day effects

## Troubleshooting

### Common Issues

#### No Variants Showing
- Check if A/B test exists in database
- Verify test status is 'running'
- Ensure variants have valid content

#### Traffic Not Splitting Evenly
- Check traffic_split values sum to 100
- Verify random function is working
- Monitor for any filtering logic

#### Events Not Tracking
- Ensure variant_id is being set in events
- Check database triggers and functions
- Verify API endpoints are accessible

### Debug Queries

```sql
-- Check A/B test configuration
SELECT * FROM ab_tests WHERE parent_id = 'your-id';

-- View variants
SELECT * FROM ab_variants WHERE ab_test_id = 'test-id';

-- Check event tracking
SELECT variant_id, COUNT(*) 
FROM events 
WHERE variant_id IS NOT NULL 
GROUP BY variant_id;

-- Monitor traffic distribution
SELECT v.subject, COUNT(e.id) as events
FROM ab_variants v
LEFT JOIN events e ON e.variant_id = v.id
WHERE v.ab_test_id = 'test-id'
GROUP BY v.id, v.subject;
```

## Future Enhancements

### Planned Features
- **Multi-variate testing**: Test multiple elements simultaneously
- **Auto-optimization**: Machine learning for automatic winner selection
- **Advanced analytics**: Bayesian statistics and confidence intervals
- **A/B testing templates**: Pre-built test configurations
- **Integration APIs**: Connect with external analytics platforms

### Performance Optimizations
- **Caching**: Redis caching for variant assignments
- **Async processing**: Background job processing for metrics
- **Real-time updates**: WebSocket connections for live metrics
- **Batch operations**: Efficient bulk variant operations

## Security & Privacy

### Data Protection
- **Row Level Security (RLS)**: Users can only access their own tests
- **Audit logging**: Track all test modifications and winner declarations
- **Data retention**: Configurable data retention policies
- **Access controls**: Role-based access to A/B testing features

### Compliance
- **GDPR compliance**: Handle personal data appropriately
- **Consent management**: Respect user preferences
- **Data anonymization**: Aggregate metrics without exposing personal information

## Support & Resources

### Documentation
- API Reference: `/api/abtest` endpoints
- Dashboard Guide: `/dashboard/abtest` usage
- Best Practices: Testing strategies and optimization

### Testing Tools
- Test Script: `scripts/test-ab-testing-email.ts`
- Database Setup: `supabase/migrations/20250135_create_ab_testing_tables.sql`
- Sample Data: Mock campaigns and sequences for testing

### Getting Help
- Check the troubleshooting section above
- Review database logs for errors
- Test with the provided test script
- Contact the development team for complex issues

---

## Quick Start

1. **Run the migration**: Apply the database migration
2. **Create your first test**: Use the API or dashboard
3. **Send emails**: The system automatically handles variants
4. **Monitor results**: Check the dashboard for performance
5. **Declare winners**: Choose the best performing variant
6. **Optimize**: Apply learnings to future campaigns

The A/B testing system is designed to be simple to use while providing powerful insights for email optimization. Start with basic tests and gradually explore more advanced features as you become comfortable with the system. 