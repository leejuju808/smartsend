interface MeetingInviteTemplateParams {
  recipientFirstName?: string;
  calendlyLink: string;
}

export function meetingInviteTemplate({
  recipientFirstName,
  calendlyLink,
}: MeetingInviteTemplateParams): string {
  const firstName = recipientFirstName || "there";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Let's Schedule a Meeting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">
                📅 Let's Schedule a Meeting
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                Hey ${firstName},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                Thanks for your interest! I'd love to connect with you.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                You can pick a time that works best for you using the link below, or simply accept the attached calendar invite.
              </p>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 32px 40px;" align="center">
              <a href="${calendlyLink}" style="display: inline-block; padding: 14px 32px; background-color: #0066ff; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600;">
                Schedule a Time
              </a>
            </td>
          </tr>
          
          <!-- Alternative Link -->
          <tr>
            <td style="padding: 0 40px 32px 40px;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6b6b6b; text-align: center;">
                Or copy this link: <a href="${calendlyLink}" style="color: #0066ff; text-decoration: none;">${calendlyLink}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 40px 40px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 8px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                Looking forward to connecting!
              </p>
              <p style="margin: 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                – SmartSend AI Team
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Footer Note -->
        <table role="presentation" style="width: 600px; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="padding: 0 40px;">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; text-align: center;">
                This calendar invite was automatically sent via SmartSend AI
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
