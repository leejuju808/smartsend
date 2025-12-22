// Minimal HTML anchor rewriter (no external deps)
export type RewriteCtx = {
  appBaseUrl: string;                 // e.g. https://app.smartsend.ai
  workspaceId: string;
  jobId: string;
  campaignId?: string | null;
  supabase: any;                      // server-side client
};

// Generate a cryptographically strong opaque token
function genToken() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
  }
  // Node fallback
  return require("crypto").randomBytes(16).toString("hex");
}

function addUtm(url: string, ctx: RewriteCtx) {
  try {
    const u = new URL(url);
    // Skip if already has smartsend tracking to avoid double tagging
    if (u.searchParams.get("utm_source")?.toLowerCase() === "smartsend") return u.toString();

    u.searchParams.set("utm_source", "smartsend");
    u.searchParams.set("utm_medium", "email");
    if (ctx.campaignId) u.searchParams.set("utm_campaign", String(ctx.campaignId));
    u.searchParams.set("utm_content", ctx.jobId);
    return u.toString();
  } catch {
    return url; // not a valid absolute URL; leave as-is
  }
}

const HREF_RE = /<a\s+([^>]*?)href\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;

export async function rewriteLinks(html: string, ctx: RewriteCtx): Promise<string> {
  let position = 0;

  async function createLink(url: string, utmUrl: string) {
    const token = genToken();
    const { error } = await ctx.supabase.from("email_links").insert({
      job_id: ctx.jobId,
      workspace_id: ctx.workspaceId,
      url,
      token,
      position: position++,
      utm: {
        utm_source: "smartsend",
        utm_medium: "email",
        utm_campaign: ctx.campaignId ?? null,
        utm_content: ctx.jobId
      }
    });
    if (error) throw new Error(error.message);
    return `${ctx.appBaseUrl}/r/${token}`;
  }

  return await html.replaceAsync
    ? (html as any).replaceAsync(HREF_RE, async (_m: string, pre: string, _q: string, dbl: string, sgl: string, bare: string, post: string, inner: string) => {
        const rawHref = dbl || sgl || bare || "";
        const href = rawHref.trim();

        // Skip mailto:, tel:, already wrapped by our redirect, or unsubscribe endpoint
        if (!href || /^mailto:|^tel:/i.test(href) || /\/r\/[A-Za-z0-9]+$/.test(href) || /\/api\/unsubscribe/.test(href)) {
          return `<a ${pre}href="${href}"${post}>${inner}</a>`;
        }

        // Only absolute http(s) destinations
        if (!/^https?:\/\//i.test(href)) return `<a ${pre}href="${href}"${post}>${inner}</a>`;

        const utmUrl = addUtm(href, ctx);
        const wrapped = await createLink(href, utmUrl);
        return `<a ${pre}href="${wrapped}"${post}>${inner}</a>`;
      })
    : // If replaceAsync is not available, do a sync pass without inserting rows (fallback)
      html.replace(HREF_RE, (m) => m);
}

// Tiny polyfill for string.replaceAsync (Node18+ runtime may lack it)
declare global {
  interface String {
    replaceAsync?(regexp: RegExp, replacer: (...args: any[]) => Promise<string>): Promise<string>;
  }
}
if (!String.prototype.replaceAsync) {
  // @ts-ignore
  String.prototype.replaceAsync = async function (regexp: RegExp, replacer: any) {
    const parts: any[] = [];
    let lastIndex = 0;
    for (const match of this.matchAll(regexp) as any) {
      const idx = match.index!;
      parts.push(this.slice(lastIndex, idx));
      parts.push(await replacer(...match, idx, this));
      lastIndex = idx + match[0].length;
    }
    parts.push(this.slice(lastIndex));
    return parts.join("");
  };
}