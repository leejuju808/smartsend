# SmartSendAI Outlook Add-in

This directory contains the Outlook add-in files for SmartSendAI, providing AI-powered reply suggestions and quick meeting scheduling directly within Outlook.

## Files

- **`manifest.xml`** - Add-in configuration and ribbon button definitions
- **`functions.html`** - Ribbon button actions (open taskpane, insert meeting)
- **`taskpane.html`** - Smart reply suggestions interface

## Setup Instructions

### 1. Update Domain URLs

Before deploying, update all `https://yourdomain.com` references in the files to your actual domain:

- `manifest.xml` - Icon URLs and source locations
- `functions.html` - Taskpane URL
- `taskpane.html` - API endpoints

### 2. Sideload for Development

1. Open Outlook on the web
2. Go to ⚙️ → View all Outlook settings
3. Navigate to Mail → Customize actions → Add-ins
4. Click "Upload custom add-in"
5. Select the `manifest.xml` file
6. The add-in will appear in your ribbon

### 3. Testing

- **Smart Reply**: Click the "Smart Reply" button to open the taskpane and get AI suggestions
- **Insert Meeting**: Click "Insert Meeting" to add meeting options with .ics calendar files

### 4. Authentication (Optional)

To link the add-in with user accounts:

1. Add a "Connect SmartSendAI" link in your web app
2. Set `localStorage.smartsend_ext_token` with the user's extension token
3. The add-in will use this token for authenticated API calls

### 5. Production Deployment

When ready for production:

1. Convert to Teams/Office Store listing
2. Map enterprise auth (Azure AD SSO) to your team domain
3. Add context from email threads via `Office.context.mailbox.item.getSharedPropertiesAsync()`

## API Integration

The add-in integrates with existing SmartSendAI endpoints:

- **`/api/replies/assist`** - Get AI reply suggestions
- **`/api/analytics/track`** - Log user interactions

## Features

- **AI Reply Suggestions**: Get contextual reply suggestions based on email content
- **Meeting Scheduling**: Insert meeting options with calendar integration
- **Analytics Tracking**: Monitor add-in usage and user behavior
- **Responsive Design**: Works across different Outlook versions and devices

## Troubleshooting

- Ensure HTTPS is enabled on your domain
- Check browser console for JavaScript errors
- Verify API endpoints are accessible from Outlook
- Test with different email types (compose vs. read)

## Support

For issues or questions, refer to the main SmartSendAI documentation or contact support. 