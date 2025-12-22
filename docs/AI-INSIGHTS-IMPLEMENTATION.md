# AI Insights Implementation

## Overview

The AI Insights system provides automated, AI-powered performance analysis and recommendations for SmartSend users. It analyzes email campaign data and generates actionable insights using OpenAI's GPT-4o-mini model.

## Features

- **Real-time Insights**: Generate AI-powered insights on-demand
- **Week-over-Week Analysis**: Compare current week performance with previous week
- **Campaign Performance**: Analyze individual campaign performance
- **Actionable Recommendations**: Get specific suggestions to improve conversions
- **Weekly Digest Emails**: Automated weekly insights sent to organization owners
- **Beautiful Dashboard**: Modern, responsive UI with performance metrics

## Architecture

### Components

1. **API Endpoint** (`/api/reports/insights`)
   - Analyzes email events data
   - Generates insights using OpenAI
   - Returns structured data with insights and stats

2. **Dashboard Page** (`/dashboard/reports/insights`)
   - React component with real-time insights
   - Performance metrics visualization
   - Week-over-week comparison charts

3. **Cron Job** (`/api/cron/weekly-insights`)
   - Runs weekly to generate insights
   - Emails summaries to organization owners
   - Processes all active organizations

4. **Navigation Integration**
   - Added to main reports page
   - Consistent tab-based navigation
   - Seamless user experience

## Data Sources

The system analyzes data from the `email_events` table:

- **Event Types**: sent, delivered, opened, clicked, replied, bounced, unsubscribed
- **Time Range**: Last 7 days vs. previous 7 days for week-over-week comparison
- **Campaign Data**: Performance across different campaigns
- **User Context**: Organization-level insights for team collaboration

## API Endpoints

### GET /api/reports/insights

Generates insights for a specific user.

**Query Parameters:**
- `userId` (required): The user ID to generate insights for

**Response:**
```json
{
  "insights": "AI-generated insights text...",
  "stats": {
    "current": { "sent": 150, "opened": 45, "clicked": 12, "replied": 3 },
    "previous": { "sent": 120, "opened": 36, "clicked": 8, "replied": 2 },
    "changes": { "sent": "25.0", "opened": "25.0", "clicked": "50.0", "replied": "50.0" }
  }
}
```

### GET /api/cron/weekly-insights

Weekly cron job that processes all organizations.

**Headers:**
- `Authorization: Bearer {CRON_SECRET}`

**Response:**
```json
{
  "success": true,
  "processed": 25,
  "errors": 0,
  "message": "Weekly insights sent to 25 organizations"
}
```

## Setup & Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional (for cron job)
CRON_SECRET=your_cron_secret_key
```

### Database Requirements

Ensure the following tables exist:
- `email_events` - Email tracking events
- `campaigns` - Campaign information
- `users` - User accounts
- `organizations` - Organization structure

### Cron Job Setup

Set up a weekly cron job to call the insights endpoint:

```bash
# Every Monday at 9 AM
0 9 * * 1 curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/weekly-insights
```

## Usage

### For Users

1. Navigate to `/dashboard/reports/insights`
2. Click "Refresh Insights" to generate new analysis
3. View AI-generated insights and recommendations
4. Analyze performance metrics and week-over-week changes

### For Developers

1. **Testing**: Use the test script to generate sample data
   ```bash
   npm run tsx scripts/test-ai-insights.ts
   ```

2. **Customization**: Modify the OpenAI prompt in the API endpoint
3. **Integration**: Add insights to other dashboard components
4. **Email Service**: Integrate with SendGrid or similar for weekly emails

## Testing

### Test Data Generation

The `scripts/test-ai-insights.ts` script creates realistic test data:

- Generates 14 days of email events
- Creates week-over-week performance differences
- Simulates realistic event type distributions
- Provides immediate testing capability

### Manual Testing

1. Run the test script to populate data
2. Visit the insights dashboard
3. Verify insights generation
4. Test the weekly cron endpoint
5. Check email delivery (currently logs to console)

## Customization

### OpenAI Prompts

Modify the prompts in both API endpoints to:
- Change the tone and style of insights
- Add specific business context
- Include industry-specific recommendations
- Adjust the level of detail

### Metrics & Analysis

Extend the system to analyze:
- Contact list performance
- Sequence effectiveness
- Reply quality scoring
- Revenue attribution
- Team member performance

### Email Templates

Customize the weekly digest emails:
- Add branding and styling
- Include more detailed metrics
- Add call-to-action buttons
- Segment by user preferences

## Performance Considerations

- **Caching**: Consider caching insights for 24 hours
- **Rate Limiting**: Implement OpenAI API rate limiting
- **Batch Processing**: Process organizations in batches for large deployments
- **Error Handling**: Robust error handling for API failures

## Security

- **Authentication**: All endpoints require proper authentication
- **Authorization**: Cron jobs use secret-based authentication
- **Data Privacy**: Only process user's own data
- **API Keys**: Secure storage of OpenAI and service keys

## Future Enhancements

1. **Real-time Insights**: WebSocket updates for live data
2. **Predictive Analytics**: Forecast future performance
3. **A/B Testing Integration**: Analyze experiment results
4. **Custom Dashboards**: User-configurable insight widgets
5. **Slack Integration**: Post insights to team channels
6. **Mobile App**: Native mobile insights experience

## Troubleshooting

### Common Issues

1. **No Insights Generated**
   - Check OpenAI API key
   - Verify email events exist
   - Check user authentication

2. **Cron Job Failures**
   - Verify CRON_SECRET environment variable
   - Check organization data structure
   - Review server logs for errors

3. **Performance Issues**
   - Monitor OpenAI API usage
   - Check database query performance
   - Implement caching if needed

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=ai-insights
```

## Support

For technical support or feature requests:
- Check the logs for error details
- Verify environment configuration
- Test with the provided test script
- Review the API response structure

---

**Implementation Date**: December 2024  
**Version**: 1.0.0  
**Status**: Production Ready 