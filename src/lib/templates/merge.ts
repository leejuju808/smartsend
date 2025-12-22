import { signUnsub } from "@/lib/suppress/token";

type Merge = Record<string, string | number | null | undefined>;

export function applyMergeTags(html: string, merge: Merge) {
  let out = html;
  for (const [k, v] of Object.entries(merge)) {
    const val = (v ?? "").toString();
    const re = new RegExp(`{{\\s*${k}\\s*}}`, "gi");
    out = out.replace(re, val);
  }
  // remove unreplaced {{token}} safely
  out = out.replace(/{{\s*[\w.-]+\s*}}/g, "");
  return out;
}

export function withFooterUnsub(bodyHtml: string, userId: string, recipientEmail: string, campaignId?: string) {
  const token = signUnsub({ u: userId, e: recipientEmail, c: campaignId });
  const url = `${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/unsub?t=${encodeURIComponent(token)}`;
  const footer = `
    <hr style="border:0;border-top:1px solid #eee;margin-top:24px"/>
    <p style="color:#777;font-size:12px">
      Don't want emails from us? <a href="${url}">Unsubscribe</a>.
    </p>`;
  return bodyHtml + footer;
}