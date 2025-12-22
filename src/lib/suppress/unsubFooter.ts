import { signUnsub } from "./token";

export function withFooterUnsub(
  bodyHtml: string,
  userId: string,
  recipientEmail: string,
  campaignId?: string
): string {
  const token = signUnsub({ u: userId, e: recipientEmail, c: campaignId });
  const url = `${process.env.NEXT_PUBLIC_BASE_URL}/api/unsub?t=${encodeURIComponent(token)}`;
  
  const footer = `
    <hr style="border:0;border-top:1px solid #eee;margin-top:24px"/>
    <p style="color:#777;font-size:12px">
      Don't want emails from us? <a href="${url}">Unsubscribe</a>.
    </p>`;
  
  // Try to inject before </body> if exists, else append
  if (/<\/body>/i.test(bodyHtml)) {
    return bodyHtml.replace(/<\/body>/i, `${footer}</body>`);
  } else {
    return bodyHtml + footer;
  }
}
