# SmartSendAI Chrome Extension

This Chrome extension integrates SmartSendAI's AI-powered reply suggestions directly into Gmail.

## Features

- ✨ AI-powered email reply suggestions
- 🔐 Secure token-based authentication
- 🚀 Seamless Gmail integration
- 🔄 Easy connection/disconnection

## Installation

### For Development (Unpacked Extension)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension/` folder
5. The SmartSendAI extension should now appear in your extensions list

### For Production

The extension will be published to the Chrome Web Store once ready.

## Setup

1. **Install the extension** (see Installation above)
2. **Connect your account:**
   - Click the SmartSendAI extension icon in your toolbar
   - Click "Connect Extension"
   - This will open SmartSendAI in a new tab
   - Make sure you're logged in to SmartSendAI
   - The extension will automatically capture the connection token
3. **Use in Gmail:**
   - Open Gmail and start composing an email
   - You'll see a "✨ Smart Reply" button appear
   - Type some content, then click the button
   - AI-powered reply suggestions will be inserted

## How It Works

1. **Authentication**: The extension uses secure, revocable tokens stored in your SmartSendAI account
2. **Gmail Integration**: Content scripts inject the Smart Reply button into Gmail's compose interface
3. **AI Suggestions**: When clicked, the extension calls SmartSendAI's API to get contextual reply suggestions
4. **Security**: All communication is encrypted and tokens can be revoked at any time

## Security Features

- **Token-based auth**: No passwords stored in the extension
- **Revocable tokens**: Disconnect anytime from SmartSendAI settings
- **Encrypted storage**: Tokens stored securely in Chrome's sync storage
- **Origin validation**: Extension only communicates with authorized domains

## Troubleshooting

### Extension not connecting?
- Make sure you're logged into SmartSendAI
- Try refreshing the extension link page
- Check that the extension has permission to access `https://smartsend.ai`

### Smart Reply button not appearing in Gmail?
- Refresh the Gmail page
- Make sure you're in compose mode
- Check the browser console for any error messages

### Getting "Unauthorized" errors?
- Your extension token may have expired or been revoked
- Go to SmartSendAI settings and reconnect the extension

## Development

### File Structure
```
extension/
├── manifest.json      # Extension configuration
├── content.js         # Gmail integration script
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
└── README.md          # This file
```

### Building
The extension is ready to use as-is. For production builds:
1. Update version in `manifest.json`
2. Package the `extension/` folder
3. Submit to Chrome Web Store

## Support

For issues or questions:
- Check the troubleshooting section above
- Visit [SmartSendAI Support](https://smartsend.ai/support)
- Email support@smartsend.ai

## Privacy

- The extension only accesses Gmail when you're actively composing emails
- All AI processing happens on SmartSendAI's secure servers
- No email content is stored locally in the extension
- Tokens are encrypted and can be revoked at any time 