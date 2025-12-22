/**
 * High Intent Reply Email Template
 * Sent when a lead replies with high buying intent
 */

interface HighIntentReplyEmailProps {
  leadName: string;
  leadEmail: string;
  meetingTime?: string;
  threadId: string;
  messagePreview?: string;
  appUrl: string;
}

export function HighIntentReplyEmail({
  leadName,
  leadEmail,
  meetingTime,
  threadId,
  messagePreview,
  appUrl,
}: HighIntentReplyEmailProps) {
  const threadUrl = `${appUrl}/replies/${threadId}`;

  return {
    subject: `🔥 High-Intent Reply: ${leadName} replied`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #000; color: #FFD700; padding: 20px; text-align: center; }
          .content { background: #fff; padding: 30px; border: 1px solid #ddd; }
          .button { display: inline-block; padding: 12px 24px; background: #FFD700; color: #000; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #FFD700; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚡ SmartSend</h1>
          </div>
          <div class="content">
            <h2>🔥 High-Intent Reply Detected</h2>
            <p><strong>${leadName}</strong> (${leadEmail}) replied with high buying intent!</p>
            
            ${meetingTime ? `
              <div class="highlight">
                <p><strong>📅 Meeting Time Detected:</strong></p>
                <p style="font-size: 18px; margin-top: 10px;">${meetingTime}</p>
              </div>
            ` : ""}
            
            ${messagePreview ? `
              <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; font-style: italic;">"${messagePreview}"</p>
              </div>
            ` : ""}
            
            <a href="${threadUrl}" class="button">View Thread & Reply</a>
          </div>
          <div class="footer">
            <p>You're receiving this because of your notification preferences.</p>
            <p><a href="${appUrl}/settings/notifications">Manage Preferences</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
}








