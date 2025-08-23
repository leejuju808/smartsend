# SmartSendAI Chrome Extension - Installation Guide

## Quick Setup

### 1. Generate Icons
1. Open `create-icons.html` in your browser
2. Click "Download All Icons" to get the required PNG files
3. Make sure you have `icon16.png`, `icon48.png`, and `icon128.png` in the extension folder

### 2. Install Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `extension/` folder
4. The SmartSendAI extension should now appear in your extensions list

### 3. Connect Your Account
1. Click the SmartSendAI extension icon in your toolbar
2. Click "Connect Extension"
3. This will open SmartSendAI in a new tab
4. Make sure you're logged in to SmartSendAI
5. The extension will automatically capture the connection token

### 4. Use in Gmail
1. Open Gmail and start composing an email
2. You'll see a "✨ Smart Reply" button appear
3. Type some content, then click the button
4. AI-powered reply suggestions will be inserted

## File Structure
```
extension/
├── manifest.json      # Extension configuration
├── content.js         # Gmail integration script
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── create-icons.html  # Icon generator
├── README.md          # Detailed documentation
└── INSTALL.md         # This file
```

## Troubleshooting

- **Extension not loading?** Make sure all files are in the extension folder
- **Icons missing?** Run the icon generator in `create-icons.html`
- **Not connecting?** Check that you're logged into SmartSendAI
- **Button not appearing in Gmail?** Refresh the Gmail page

## Next Steps

Once the extension is working, you can:
1. Test the Smart Reply functionality in Gmail
2. Customize the button styling in `content.js`
3. Add more features like tone selection
4. Package for Chrome Web Store distribution

## Support

For issues or questions:
- Check the troubleshooting section above
- Visit [SmartSendAI Support](https://smartsend.ai/support)
- Email support@smartsend.ai 