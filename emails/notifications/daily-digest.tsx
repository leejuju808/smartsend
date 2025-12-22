/**
 * Daily Digest Email Template
 * Sent daily with summary of activity
 */

interface DailyDigestEmailProps {
  date: string;
  meetingsDetected: number;
  replies: number;
  topTemplate?: { name: string; performance: string };
  sendVolume: number;
  mailboxWarnings: number;
  pipelineAdditions: number;
  appUrl: string;
}

export function DailyDigestEmail({
  date,
  meetingsDetected,
  replies,
  topTemplate,
  sendVolume,
  mailboxWarnings,
  pipelineAdditions,
  appUrl,
}: DailyDigestEmailProps) {
  return {
    subject: `📊 SmartSend Daily Digest — ${date}`,
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
            <h2>📊 Daily Digest — ${date}</h2>
            
            <div style="text-align: center; margin: 30px 0;">
              <div class="stat">
                <div class="stat-value">${meetingsDetected}</div>
                <div class="stat-label">Meetings Detected</div>
              </div>
              <div class="stat">
                <div class="stat-value">${replies}</div>
                <div class="stat-label">Replies</div>
              </div>
              <div class="stat">
                <div class="stat-value">${sendVolume}</div>
                <div class="stat-label">Emails Sent</div>
              </div>
            </div>
            
            ${topTemplate ? `
              <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p><strong>🏆 Top Performing Template:</strong></p>
                <p style="margin-top: 5px;">${topTemplate.name} — ${topTemplate.performance}</p>
              </div>
            ` : ""}
            
            ${mailboxWarnings > 0 ? `
              <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
                <p><strong>⚠️ Mailbox Warnings:</strong> ${mailboxWarnings}</p>
              </div>
            ` : ""}
            
            ${pipelineAdditions > 0 ? `
              <div style="background: #d1ecf1; padding: 15px; border-left: 4px solid #0dcaf0; margin: 20px 0;">
                <p><strong>📈 Pipeline Additions:</strong> ${pipelineAdditions} new deals</p>
              </div>
            ` : ""}
            
            <a href="${appUrl}/dashboard" class="button">View Dashboard</a>
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








