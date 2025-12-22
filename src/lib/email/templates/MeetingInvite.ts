export function meetingInviteTemplate({
  recipientFirstName,
  calendlyLink,
}: {
  recipientFirstName?: string;
  calendlyLink: string;
}) {
  const hi = recipientFirstName ? `Hi ${recipientFirstName},` : "Hi there,";
  return `
  <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
    <p>${hi}</p>
    <p>Great to connect! I dropped a calendar invite (.ics) here so you can add it in one click.</p>
    <p>If you'd rather pick a time that works best for you, use this link:<br>
      <a href="${calendlyLink}" target="_blank" rel="noopener noreferrer">${calendlyLink}</a>
    </p>
    <p>Looking forward,<br/>SmartSend AI</p>
  </div>
  `;
}
