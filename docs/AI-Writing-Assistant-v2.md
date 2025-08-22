# AI Writing Assistant v2

## Overview

The AI Writing Assistant v2 is a comprehensive email optimization system that provides real-time AI-powered feedback, suggestions, and scoring for email campaigns. It integrates seamlessly with SmartSendAI's existing email template system to help users create more engaging and effective emails.

## Features

### 🎯 Core Capabilities

- **Real-Time AI Scoring**: Instant feedback on email effectiveness (0-100 scale)
- **Smart Suggestions**: AI-generated improvements for subject lines, body content, tone, and personalization
- **Performance Insights**: Actionable recommendations based on AI analysis
- **Template Optimization**: Optimize existing email templates with AI suggestions
- **Personalization Tokens**: Automatic insertion of dynamic variables like `{{first_name}}`, `{{company}}`

### 🚀 Key Benefits

- **Higher Engagement**: AI-optimized content leads to better open rates and click-through rates
- **Time Savings**: Quick suggestions and one-click improvements
- **Data-Driven**: Learn from performance data to continuously improve suggestions
- **User-Friendly**: Intuitive interface with clear scoring and actionable feedback

## Architecture

### Database Schema

```sql
-- Extended email_templates table
ALTER TABLE email_templates ADD COLUMN optimized_version TEXT;
ALTER TABLE email_templates ADD COLUMN performance_notes TEXT;

-- New template_suggestions table
CREATE TABLE template_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id) ON DELETE CASCADE,
  suggestion TEXT NOT NULL,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('subject', 'body', 'tone', 'personalization')),
  ai_score INTEGER CHECK (ai_score >= 0 AND ai_score <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted BOOLEAN DEFAULT FALSE
);
```

### API Endpoints

- `POST /api/ai-writing/optimize` - Generate AI suggestions for email optimization
- `POST /api/ai-writing/score` - Score existing email content
- `GET /api/templates/[id]/suggestions` - Retrieve suggestions for a template
- `POST /api/templates/suggestions/[id]/accept` - Accept a suggestion
- `POST /api/templates/suggestions/[id]/reject` - Reject a suggestion

### Core Components

1. **AIWritingAssistant** - Main component for real-time feedback and suggestions
2. **AITemplateOptimizer** - Component for optimizing existing templates
3. **AIWritingAssistant** - Core AI logic and OpenAI integration
4. **Usage Tracking** - Quota management for AI features

## Implementation Details

### AI Models & Prompts

The system uses GPT-4 for generating suggestions and scoring emails. Each optimization area has specialized prompts:

- **Subject Lines**: Focus on curiosity, personalization, clarity, and actionability
- **Body Content**: Emphasize persuasiveness, structure, personalization, and call-to-action
- **Tone**: Consider audience fit, industry appropriateness, and goal alignment
- **Personalization**: Evaluate relevance, implementation ease, and impact potential

### Scoring System

Emails are scored on a 0-100 scale based on multiple criteria:

- **Subject Lines**: Curiosity (25), Personalization (25), Clarity (25), Actionability (25)
- **Body Content**: Persuasiveness (25), Structure (25), Personalization (25), Call-to-action (25)
- **Tone**: Audience Fit (40), Industry Appropriateness (30), Goal Alignment (30)
- **Personalization**: Relevance (40), Implementation Ease (30), Impact Potential (30)

### Usage Quotas

- **Free Plan**: 3 AI optimizations, 10 AI scorings per day
- **Pro Plan**: 500 AI optimizations, unlimited AI scorings per day

## User Experience Flow

### 1. Campaign Creation
1. User fills in target audience and product/service
2. AI Writing Assistant becomes active
3. Real-time scoring appears as user types
4. "Optimize with AI" button generates suggestions
5. User can apply, edit, or ignore suggestions

### 2. Template Optimization
1. User selects existing template
2. Clicks "Optimize Template with AI"
3. AI analyzes current content and generates improvements
4. User reviews and accepts/rejects suggestions
5. Performance notes are updated automatically

### 3. Real-Time Feedback
- AI score updates automatically as content changes
- Color-coded scoring (Green: 80+, Yellow: 60-79, Red: <60)
- Performance insights provide actionable recommendations

## Integration Points

### Campaign Creation
- Integrated into `/dashboard/campaigns/new` page
- Side panel with AI Writing Assistant
- Real-time feedback during composition

### Template Management
- AI optimization for existing templates
- Suggestion tracking and acceptance
- Performance analytics integration

### Usage Tracking
- Integrated with existing quota system
- Separate tracking for AI features
- Plan-based limitations

## Configuration

### Environment Variables

```bash
# AI Feature Quotas
FREE_QUOTA_AI_OPTIMIZATION=3
FREE_QUOTA_AI_SCORING=10

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### Database Setup

Run the updated `database-setup.sql` to add the new columns and tables:

```bash
# Apply database changes
psql -d your_database -f database-setup.sql
```

## Usage Examples

### Basic Email Optimization

```typescript
import { AIWritingAssistant } from '@/lib/ai-writing-assistant';

const result = await AIWritingAssistant.generateSuggestions({
  content: {
    subject: "Quick question about your business",
    body: "Hi {{first_name}}, I noticed your company...",
    tone: "professional",
    targetAudience: "SaaS founders",
    productService: "Email automation platform"
  },
  focusAreas: ["subject", "body", "tone", "personalization"]
});
```

### Email Scoring

```typescript
const score = await AIWritingAssistant.scoreEmail({
  subject: "Quick question about your business",
  body: "Hi {{first_name}}, I noticed your company...",
  tone: "professional",
  targetAudience: "SaaS founders",
  productService: "Email automation platform"
});
```

## Performance Considerations

### Rate Limiting
- AI optimization: 3 requests/day (free), 500/day (pro)
- AI scoring: 10 requests/day (free), unlimited (pro)
- Debounced scoring to prevent excessive API calls

### Caching
- Template suggestions are stored in database
- Performance notes are cached with templates
- AI scores are calculated in real-time

### Error Handling
- Graceful fallbacks for AI service failures
- Default scores when AI analysis is unavailable
- User-friendly error messages

## Future Enhancements

### Planned Features
- **A/B Testing**: AI-generated variations for testing
- **Industry Benchmarks**: Compare performance against industry standards
- **Advanced Analytics**: Detailed performance insights and trends
- **Multi-language Support**: AI optimization in multiple languages
- **Template Library**: AI-curated template suggestions

### Technical Improvements
- **Batch Processing**: Optimize multiple emails simultaneously
- **Custom Models**: Fine-tuned models for specific industries
- **Real-time Learning**: Improve suggestions based on user feedback
- **Performance Tracking**: Track which suggestions lead to better results

## Troubleshooting

### Common Issues

1. **AI Service Unavailable**
   - Check OpenAI API key configuration
   - Verify API quota and billing status
   - Check network connectivity

2. **Quota Exceeded**
   - Upgrade to Pro plan for higher limits
   - Wait for daily quota reset
   - Contact support for quota increases

3. **Poor Suggestions**
   - Ensure target audience and product/service are specific
   - Provide clear, detailed content for better analysis
   - Use appropriate tone for your audience

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG_AI_WRITING=true
```

This will log all AI requests and responses for troubleshooting.

## Support

For technical support or feature requests:

- **Documentation**: Check this guide and inline code comments
- **Issues**: Report bugs through the GitHub issue tracker
- **Support**: Contact the development team for assistance

## Contributing

To contribute to the AI Writing Assistant:

1. Follow the existing code style and patterns
2. Add comprehensive tests for new features
3. Update documentation for any changes
4. Ensure proper error handling and user feedback
5. Test with various email types and audiences

---

*Last updated: December 2024*
*Version: 2.0.0* 