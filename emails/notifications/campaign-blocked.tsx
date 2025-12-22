/**
 * Campaign Blocked Email Template
 * Sent when a campaign is blocked by Review Center
 */

interface CampaignBlockedEmailProps {
  campaignName: string;
  campaignId: string;
  reason?: string;
  appUrl: string;
}

export function CampaignBlockedEmail({
  campaignName,
  campaignId,
  reason,
  appUrl,
}: CampaignBlockedEmailProps) {
  const campaignUrl = `${appUrl}/campaigns/${campaignId}`;

  return {
    subject: `🚫 Campaign "${campaignName}" cannot launch`,
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
          .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚡ SmartSend</h1>
          </div>
          <div class="content">
            <h2>🚫 Campaign Blocked</h2>
            <p>Your campaign <strong>"${campaignName}"</strong> cannot launch.</p>
            
            ${reason ? `
              <div class="warning">
                <p><strong>Reason:</strong></p>
                <p style="margin-top: 10px;">${reason}</p>
              </div>
            ` : ""}
            
            <p>Please review the campaign settings and make necessary changes before launching.</p>
            
            <a href="${campaignUrl}" class="button">View Campaign</a>
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








