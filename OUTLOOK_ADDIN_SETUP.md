# SmartSendAI Outlook Add-in Setup Guide

## Overview

The SmartSendAI Outlook add-in provides AI-powered reply suggestions and quick meeting scheduling directly within Outlook. Users can get contextual reply suggestions and insert meeting options with calendar integration.

## Files Created

```
public/outlook/
├── manifest.xml          # Add-in configuration and ribbon buttons
├── functions.html        # Ribbon button actions
├── taskpane.html        # Smart reply interface
├── icon.svg             # 32x32 icon
├── icon-128.svg         # 128x128 icon
└── README.md            # Detailed setup instructions
```

## Quick Start

### 1. Update Domain URLs

Before deploying, replace all `https://yourdomain.com` references with your actual domain in:
- `manifest.xml`
- `functions.html` 
- `taskpane.html`

### 2. Sideload for Development

1. Open Outlook on the web
2. Go to ⚙️ → View all Outlook settings
3. Navigate to Mail → Customize actions → Add-ins
4. Click "Upload custom add-in"
5. Select `public/outlook/manifest.xml`
6. The add-in will appear in your ribbon

### 3. Test Features

- **Smart Reply**: Click "Smart Reply" button → taskpane opens → get AI suggestions
- **Insert Meeting**: Click "Insert Meeting" → three time slots + .ics calendar file inserted

## Features

### AI Reply Suggestions
- Analyzes current email draft content
- Provides contextual reply suggestions
- Integrates with existing `/api/replies/assist` endpoint
- Supports multiple reply types and tones

### Meeting Scheduling
- Generates next 3 available time slots (weekdays only)
- Creates .ics calendar files for easy scheduling
- Inserts formatted meeting options into email body
- Skips weekends and past times

### Analytics Integration
- Tracks add-in usage via `/api/analytics/track`
- Logs which reply variants users select
- Monitors user engagement and preferences

## API Integration

The add-in seamlessly integrates with existing SmartSendAI infrastructure:

- **Reply Suggestions**: Uses `/api/replies/assist` endpoint
- **Analytics**: Logs events via `/api/analytics/track`
- **Authentication**: Optional extension token support
- **User Context**: Leverages existing user styles and preferences

## Authentication (Optional)

To link add-in usage with user accounts:

1. Generate extension access tokens for users
2. Set `localStorage.smartsend_ext_token` in the taskpane
3. Add-in will use token for authenticated API calls
4. Track individual user behavior and preferences

## Production Deployment

### Office Store Listing
1. Convert manifest to production format
2. Submit for Office Store review
3. Enable enterprise distribution

### Enterprise Features
1. Map Azure AD SSO to your team domains
2. Add context from email threads
3. Implement team-wide analytics
4. Add admin controls and usage limits

## Customization

### Meeting Templates
- Modify `insertMeeting()` function in `functions.html`
- Customize meeting duration, time slots, and format
- Add company-specific meeting descriptions

### Reply Suggestions
- Adjust suggestion count in `taskpane.html`
- Customize UI styling and branding
- Add industry-specific reply templates

### Analytics Events
- Track additional user interactions
- Monitor feature adoption rates
- A/B test different suggestion algorithms

## Troubleshooting

### Common Issues
- **HTTPS Required**: Ensure all URLs use HTTPS
- **CORS**: Verify API endpoints allow Outlook domain
- **Icon Loading**: Check icon file paths and formats
- **API Errors**: Monitor browser console for fetch errors

### Debug Mode
- Enable browser developer tools in Outlook
- Check network requests and responses
- Verify localStorage token values
- Test API endpoints independently

## Security Considerations

- Validate all user inputs
- Sanitize email content before AI processing
- Rate limit API calls from add-in
- Monitor for abuse or excessive usage
- Implement proper CORS policies

## Performance Optimization

- Cache user preferences locally
- Minimize API calls during typing
- Use efficient data structures for time slots
- Optimize icon file sizes

## Support & Maintenance

- Monitor add-in usage analytics
- Track user feedback and issues
- Regular updates for Office compatibility
- Performance monitoring and optimization

## Next Steps

1. **Test thoroughly** in development environment
2. **Update domain URLs** for production
3. **Deploy to staging** and validate
4. **Submit to Office Store** when ready
5. **Monitor usage** and gather feedback
6. **Iterate** based on user behavior

The Outlook add-in is now ready for development testing and can be deployed to production with minimal configuration changes. 