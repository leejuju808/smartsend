/**
 * Mailbox Health Warning Email Template
 * Sent when bounce rates rise or mailbox issues are detected
 */

interface MailboxHealthEmailProps {
  mailboxEmail: string;
  bounceRate?: number;
  issue: string;
  appUrl: string;
}

export function MailboxHealthEmail({
  mailboxEmail,
  bounceRate,
  issue,
  appUrl,
}: MailboxHealthEmailProps) {
  const mailboxesUrl = `${appUrl}/settings/mailboxes`;

  return {
    subject: `⚠ Bounce Rate Rising on ${mailboxEmail}`,
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
          .alert { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚡ SmartSend</h1>
          </div>
          <div class="content">
            <h2>⚠️ Mailbox Health Warning</h2>
            <p>We've detected an issue with your mailbox <strong>${mailboxEmail}</strong>.</p>
            
            <div class="alert">
              <p><strong>Issue:</strong></p>
              <p style="margin-top: 10px;">${issue}</p>
              ${bounceRate ? `<p style="margin-top: 10px;"><strong>Current Bounce Rate:</strong> ${bounceRate}%</p>` : ""}
            </div>
            
            <p>Please review your mailbox settings and consider pausing sends until the issue is resolved.</p>
            
            <a href="${mailboxesUrl}" class="button">Check Mailbox Health</a>
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








