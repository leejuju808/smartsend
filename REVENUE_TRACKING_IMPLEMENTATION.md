# Revenue Tracking System Implementation

## Overview

The Revenue Tracking System provides comprehensive SaaS revenue analytics, including MRR (Monthly Recurring Revenue), ARR (Annual Recurring Revenue), churn rate tracking, and AI-powered insights for business growth and retention.

## Features

- **Real-time Revenue Tracking**: Automatic MRR/ARR calculation from Stripe subscriptions
- **Churn Detection**: Monitor subscription cancellations and churn rates
- **AI-Powered Insights**: GPT-4 powered revenue analysis and recommendations
- **Dashboard Visualization**: Beautiful charts and metrics display
- **Webhook Integration**: Seamless Stripe webhook processing
- **Multi-tenant Support**: Organization-based revenue tracking

## Architecture

### Database Schema

```sql
-- Revenue tracking table
create table public.org_revenue (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  mrr numeric default 0,                    -- Monthly Recurring Revenue
  arr numeric default 0,                    -- Annual Recurring Revenue  
  churn_rate numeric default 0,             -- Churn rate percentage
  last_sync timestamptz default now(),      -- Last Stripe sync
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index idx_org_revenue_org_id on public.org_revenue(org_id);
create index idx_org_revenue_last_sync on public.org_revenue(last_sync);

-- RLS policies for security
create policy "org_revenue_select_member" on public.org_revenue
  for select using (
    exists (
      select 1 from public.org_members m
      where m.org_id = org_revenue.org_id and m.user_id = auth.uid()
    )
  );
```

### API Endpoints

#### 1. Revenue Data API
```
GET /api/org-revenue?org_id={org_id}
```
Returns revenue data for a specific organization.

#### 2. AI Insights API
```
GET /api/revenue/insights?org_id={org_id}
```
Returns AI-generated revenue insights and recommendations.

#### 3. Stripe Webhook
```
POST /api/webhooks/stripe
```
Processes Stripe webhook events to update revenue metrics.

## Implementation Details

### 1. Stripe Webhook Integration

The system automatically processes these Stripe events:

- **`customer.subscription.created`**: Initial subscription setup
- **`customer.subscription.updated`**: Plan changes, upgrades, downgrades
- **`invoice.payment_succeeded`**: Successful payments
- **`customer.subscription.deleted`**: Subscription cancellations

**Example Webhook Processing:**
```typescript
case "customer.subscription.updated":
case "invoice.payment_succeeded":
  const subscription = event.data.object as Stripe.Subscription;
  
  // Calculate MRR from subscription items
  const mrr = subscription.items.data.reduce((sum: number, item: any) => {
    const unitAmount = item.price.unit_amount || 0;
    const quantity = item.quantity || 1;
    return sum + (unitAmount * quantity);
  }, 0) / 100; // Convert from cents to dollars
  
  const arr = mrr * 12;
  
  // Upsert revenue data
  await supabase
    .from("org_revenue")
    .upsert(
      { 
        org_id: orgId, 
        mrr, 
        arr, 
        last_sync: new Date().toISOString() 
      }, 
      { onConflict: "org_id" }
    );
```

### 2. AI Insights Generation

The system uses OpenAI's GPT-4 to analyze revenue data and provide actionable insights:

**Prompt Example:**
```
Analyze this SaaS organization's revenue data and provide insights on growth potential and churn risk.

Current Metrics:
- MRR (Monthly Recurring Revenue): $99
- ARR (Annual Recurring Revenue): $1188
- Churn Rate: 0%
- Last Updated: 1/31/2025

Please provide:
1. 3 key insights about the current revenue situation
2. 1 actionable recommendation to improve retention or growth
3. A brief churn risk assessment (Low/Medium/High)
```

**Response Example:**
```
Key Insights:
• Strong revenue growth with $99 MRR indicates healthy subscription business
• Zero churn rate suggests excellent customer satisfaction and retention
• ARR of $1,188 provides solid foundation for scaling operations

Recommendation:
Implement customer success programs and upselling strategies to increase MRR per customer while maintaining zero churn.

Churn Risk: LOW - Current zero churn rate and stable revenue suggest minimal risk.
```

### 3. Dashboard Components

#### Revenue Metrics Cards
- **MRR Card**: Shows current monthly recurring revenue with trend indicators
- **ARR Card**: Displays annual recurring revenue with month-over-month changes
- **Churn Rate Card**: Tracks customer retention metrics

#### Revenue Trend Chart
- Historical MRR and ARR data visualization
- Time-series data for trend analysis
- Responsive design for mobile and desktop

#### AI Insights Panel
- Real-time AI-generated recommendations
- Churn risk assessment
- Growth opportunity identification

## Setup Instructions

### 1. Database Migration

Run the migration to create the revenue tracking table:

```bash
# Apply the migration
supabase db push

# Or manually run the SQL
psql -h your-supabase-host -U postgres -d postgres -f supabase/migrations/20250131_create_org_revenue.sql
```

### 2. Environment Variables

Ensure these environment variables are set:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Stripe Webhook Configuration

Configure Stripe webhooks to point to your endpoint:

```
URL: https://yourdomain.com/api/webhooks/stripe
Events: 
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
```

### 4. Dashboard Access

Add the revenue dashboard to your navigation:

```typescript
// In dashboard layout
{canManageBilling(myRole) && (
  <Link href="/dashboard/revenue">
    <BarChart3 className="mr-3 h-5 w-5" />
    Revenue
  </Link>
)}
```

## Testing

### Run the Test Script

```bash
# Install dependencies if needed
npm install

# Run the test script
npx tsx scripts/test-revenue-system.ts
```

The test script will:
1. Create a test organization
2. Simulate subscription events
3. Test revenue calculations
4. Verify data persistence
5. Clean up test data

### Manual Testing

1. **Create Test Subscription**: Use Stripe test mode to create a subscription
2. **Trigger Webhook**: Send test webhook events to your endpoint
3. **Verify Dashboard**: Check that revenue data appears in the dashboard
4. **Test AI Insights**: Verify that insights are generated for the test data

## Usage Examples

### 1. View Revenue Dashboard

Navigate to `/dashboard/revenue` to see:
- Current MRR and ARR
- Historical trends
- Churn rate metrics
- AI-generated insights

### 2. Monitor Subscription Changes

The system automatically tracks:
- New subscriptions
- Plan upgrades/downgrades
- Subscription cancellations
- Payment failures

### 3. Generate Revenue Reports

Use the API endpoints to:
- Export revenue data
- Generate custom reports
- Integrate with external analytics tools

## Security Features

- **Row Level Security (RLS)**: Users can only see revenue data for their organizations
- **Service Role Access**: Webhook processing uses service role for data updates
- **Input Validation**: All webhook data is validated before processing
- **Error Handling**: Comprehensive error handling and logging

## Performance Considerations

- **Indexed Queries**: Database indexes on `org_id` and `last_sync`
- **Efficient Updates**: Upsert operations to avoid duplicate records
- **Caching**: Revenue data is cached in the dashboard for better UX
- **Async Processing**: Webhook processing is non-blocking

## Monitoring and Alerts

### Key Metrics to Monitor

- **Webhook Success Rate**: Ensure Stripe events are processed correctly
- **Revenue Data Freshness**: Monitor `last_sync` timestamps
- **AI Insights Generation**: Track OpenAI API usage and response times
- **Database Performance**: Monitor query performance on revenue tables

### Error Handling

The system includes comprehensive error handling:
- Webhook signature verification
- Database constraint validation
- OpenAI API error handling
- User-friendly error messages

## Future Enhancements

### Phase 2 Features

- **Advanced Analytics**: Cohort analysis, LTV calculations
- **Predictive Modeling**: Churn prediction algorithms
- **Revenue Forecasting**: AI-powered revenue projections
- **Integration APIs**: Connect with CRM and accounting systems

### Phase 3 Features

- **Multi-currency Support**: Handle international subscriptions
- **Revenue Attribution**: Track revenue sources and campaigns
- **Advanced Reporting**: Custom report builder
- **Mobile App**: Native mobile dashboard

## Troubleshooting

### Common Issues

1. **Webhook Not Processing**
   - Check Stripe webhook configuration
   - Verify webhook secret in environment variables
   - Check server logs for errors

2. **Revenue Data Not Updating**
   - Verify organization has `stripe_subscription_id`
   - Check webhook event types are configured
   - Validate database permissions

3. **AI Insights Not Generating**
   - Check OpenAI API key configuration
   - Verify API rate limits
   - Check for revenue data availability

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=revenue:*
```

## Support

For technical support or questions about the Revenue Tracking System:

1. Check the logs for error details
2. Verify environment variable configuration
3. Test webhook endpoints manually
4. Review database migration status

## Conclusion

The Revenue Tracking System provides a robust foundation for SaaS revenue analytics, combining real-time data from Stripe with AI-powered insights to drive business growth and customer retention. The system is designed to scale with your business and provides actionable intelligence for revenue optimization. 