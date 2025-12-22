/**
 * Weekly Digest Email Template
 * Sent weekly with performance summary
 */

interface WeeklyDigestEmailProps {
  dateRange: string;
  totalReplies: number;
  meetingsBooked: number;
  emailsSent: number;
  topCampaign?: { name: string; replyRate: string };
  topTemplate?: { name: string; performance: string };
  appUrl: string;
}

export function WeeklyDigestEmail({
  dateRange,
  totalReplies,
  meetingsBooked,
  emailsSent,
  topCampaign,
  topTemplate,
  appUrl,
}: WeeklyDigestEmailProps) {
  return {
    subject: `📈 Weekly SmartSend Report — ${dateRange}`,
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
          .stat { display: inline-block; margin: 10px; padding: 15px; background: #f5f5f5; border-radius: 4px; text-align: center; min-width: 120px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #000; }
          .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚡ SmartSend</h1>
          </div>
          <div class="content">
            <h2>📈 Weekly Report — ${dateRange}</h2>
            
            <div style="text-align: center; margin: 30px 0;">
              <div class="stat">
                <div class="stat-value">${totalReplies}</div>
                <div class="stat-label">Total Replies</div>
              </div>
              <div class="stat">
                <div class="stat-value">${meetingsBooked}</div>
                <div class="stat-label">Meetings Booked</div>
              </div>
              <div class="stat">
                <div class="stat-value">${emailsSent}</div>
                <div class="stat-label">Emails Sent</div>
              </div>
            </div>
            
            ${topCampaign ? `
              <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p><strong>🏆 Top Campaign:</strong></p>
                <p style="margin-top: 5px;">${topCampaign.name} — ${topCampaign.replyRate} reply rate</p>
              </div>
            ` : ""}
            
            ${topTemplate ? `
              <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p><strong>🏆 Top Template:</strong></p>
                <p style="margin-top: 5px;">${topTemplate.name} — ${topTemplate.performance}</p>
              </div>
            ` : ""}
            
            <a href="${appUrl}/dashboard" class="button">View Full Analytics</a>
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








