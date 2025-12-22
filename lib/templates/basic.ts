export function basicTemplate({
  brand = process.env.SMARTSEND_BRAND_NAME || "SmartSend",
  headline,
  body,
  ctaText,
  ctaUrl,
  footerNote,
  unsubscribeUrl,
}: {
  brand?: string;
  headline: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
  unsubscribeUrl: string;
}) {
  const btn = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;padding:12px 18px;background:#F5C518;color:#000;border-radius:10px;font-weight:700;text-decoration:none">${ctaText}</a>`
    : "";

  return `
  <div style="background:#0b0b0b;color:#eaeaea;font-family:Inter,system-ui,Segoe UI,Arial,sans-serif;padding:32px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#111;border:1px solid #232323;border-radius:16px">
      <tr>
        <td style="padding:24px 24px 8px 24px">
          <div style="font-size:18px;color:#f5c518">⚡ ${brand}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 8px 24px">
          <h1 style="margin:12px 0 0 0;font-size:22px;color:#fff">${headline}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 24px 16px 24px;line-height:1.6;color:#cfcfcf">
          ${body}
        </td>
      </tr>
      ${btn ? `<tr><td style="padding:8px 24px 24px 24px">${btn}</td></tr>` : ""}
      <tr>
        <td style="padding:16px 24px 20px 24px;font-size:12px;color:#8a8a8a;border-top:1px solid #232323">
          ${footerNote ?? "You're receiving this because you interacted with a SmartSend campaign."}<br/>
          <a href="${unsubscribeUrl}" style="color:#8a8a8a">Unsubscribe</a>
        </td>
      </tr>
    </table>
  </div>
  `;
}