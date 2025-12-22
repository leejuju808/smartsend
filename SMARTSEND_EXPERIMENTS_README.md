# SmartSend Experiments Pack

**A/B/n Testing with Thompson Sampling + Per-Step Variants + Auto-Winner**

## Overview

The SmartSend Experiments pack provides built-in A/B/n testing capabilities that continuously improve your email copy performance. It uses Thompson Sampling (a multi-armed bandit algorithm) to automatically allocate traffic to the best-performing variants while maintaining exploration.

## Features

- **A/B/n Testing**: Test multiple variants per campaign step
- **Thompson Sampling**: Intelligent traffic allocation that balances exploration vs exploitation
- **Per-Step Variants**: Different variants for each step in multi-step sequences
- **Auto-Winner Detection**: Automatically declares winners based on statistical significance
- **Real-time Metrics**: Live tracking of impressions, opens, clicks, and replies per variant
- **Manual Override**: Force declare winners or pause variants manually
- **Drop-in Integration**: Works with your existing cron sender and tracking system

## Quick Start

### 1. Run the Database Migration

Execute the SQL migration in your Supabase SQL editor:

```sql
-- Run the migration file: supabase/migrations/20250125_add_experiments_system.sql
```

### 2. Add Variants to Your Campaign

Navigate to your campaign and click the "Variants" button, or go to:
```
/dashboard/campaigns/{campaign_id}/variants
```

Create A/B variants with different:
- Subject lines
- Email bodies
- Objectives (open rate, click rate, or reply rate)

### 3. Start Your Campaign

The system will automatically:
- Select variants using Thompson Sampling
- Track deliveries and assign variant IDs
- Record metrics for opens, clicks, and replies
- Declare winners when statistically significant

## How It Works

### Thompson Sampling Algorithm

Thompson Sampling automatically balances exploration and exploitation:

1. **Exploration**: Gives chances to variants with fewer impressions
2. **Exploitation**: Favors variants with higher observed success rates
3. **Adaptive**: Automatically adjusts allocation as performance data accumulates

### Traffic Allocation

- **Cold Start**: New variants get exploration traffic
- **Learning Phase**: Balanced allocation while gathering data
- **Optimization**: Traffic concentrates on best performers
- **Auto-Winner**: Declares winner when statistically significant

### Objective Optimization

The system optimizes for your chosen objective:
- **Reply Rate** (default): Highest value, stops sequences
- **Click Rate**: Engagement metric
- **Open Rate**: Deliverability indicator

## API Endpoints

### Variants Management

```typescript
// Create/Update variants
POST /api/variants/upsert
{
  campaign_id: string,
  step_index: number,
  variants: Array<{
    name: string,
    subject: string,
    body_html: string,
    objective: 'open' | 'click' | 'reply',
    min_impressions: number
  }>
}

// List variants with metrics
GET /api/variants/list?campaign_id={id}&step_index={step}

// Manage winners/pause
POST /api/variants/winner
{
  campaign_id: string,
  step_index: number,
  variant_id: string,
  action: 'declare_winner' | 'pause' | 'resume'
}
```

### Integration Points

The experiments system integrates with:

- **Cron Sender**: Automatically selects variants and records deliveries
- **Tracking Endpoints**: Increment variant metrics for opens/clicks
- **Inbound Webhooks**: Track replies per variant

## Database Schema

### Core Tables

```sql
-- Campaign variants
campaign_variants (
  id, campaign_id, step_index, name, subject, body_html,
  objective, min_impressions, is_winner, is_paused
)

-- Variant performance metrics
variant_metrics (
  variant_id, campaign_id, step_index,
  impressions, opens, clicks, replies
)

-- Delivery tracking
deliveries (
  campaign_id, variant_id, contact_id, step_index, status
)
```

### RPC Functions

```sql
-- Get variant metrics for a campaign step
get_variant_metrics(p_campaign_id, p_step_index)

-- Auto-declare winner based on objective
auto_declare_winner(p_campaign_id, p_step_index)
```

## Usage Examples

### Single Campaign A/B Test

```typescript
// Create two variants for a single campaign
const variants = [
  {
    name: 'Variant A',
    subject: 'Quick question about your business',
    body_html: '<p>Hi {first_name}, I noticed...</p>',
    objective: 'reply',
    min_impressions: 100
  },
  {
    name: 'Variant B', 
    subject: 'Free consultation for {company}',
    body_html: '<p>Hello {first_name}, I can help...</p>',
    objective: 'reply',
    min_impressions: 100
  }
];
```

### Multi-Step Sequence Testing

```typescript
// Test different follow-up approaches per step
const step0Variants = [/* Initial email variants */];
const step1Variants = [/* Follow-up variants */];
const step2Variants = [/* Final reminder variants */];

// Each step can have different objectives
// Step 0: optimize for reply
// Step 1: optimize for click  
// Step 2: optimize for open
```

## Best Practices

### Variant Design

1. **Clear Differences**: Make variants meaningfully different
2. **Single Variable**: Test one element at a time (subject OR body)
3. **Realistic Volume**: Ensure minimum impressions for statistical significance
4. **Objective Alignment**: Choose objective that matches business goals

### Monitoring

1. **Watch Early Results**: Monitor performance in first 24-48 hours
2. **Statistical Significance**: Wait for minimum impressions before declaring winners
3. **Performance Trends**: Look for consistent performance patterns
4. **Manual Override**: Use manual winner declaration for business-critical decisions

### Optimization

1. **Iterate Winners**: Use winning variants as base for next test
2. **Segment Testing**: Test variants against different audience segments
3. **Seasonal Testing**: Account for time-based performance variations
4. **Continuous Testing**: Always have A/B tests running

## Troubleshooting

### Common Issues

**Variants not being selected:**
- Check if variants are paused
- Verify campaign is running
- Check for database connection issues

**Metrics not updating:**
- Verify tracking tokens have variant_id
- Check delivery records are being created
- Ensure tracking endpoints are working

**Auto-winner not declared:**
- Check minimum impressions threshold
- Verify statistical significance
- Look for performance differences

### Debug Mode

Enable debug logging in your cron sender:

```typescript
console.log(`Selected variant "${variant.name}" for ${recipient.email} (confidence: ${selectedVariant.confidence.toFixed(2)})`);
```

## Performance Impact

- **Minimal Overhead**: <5ms per email send
- **Database**: Additional queries for variant selection and metrics
- **Memory**: Bandit algorithm uses minimal memory
- **Scalability**: Handles thousands of variants efficiently

## Future Enhancements

- **Multi-Objective**: Optimize reply rate while maintaining open rate floor
- **Segmented Testing**: Test variants against different audience segments
- **Bayesian Intervals**: Confidence intervals in UI
- **Content Lint**: Preflight spam detection per variant
- **Predictive Analytics**: Forecast variant performance

## Support

For questions or issues with the SmartSend Experiments pack:

1. Check this README
2. Review database logs for errors
3. Verify API endpoint responses
4. Check browser console for UI errors

## License

This pack is part of SmartSend and follows the same licensing terms. 