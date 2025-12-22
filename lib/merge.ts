export function mergeVars(html: string, vars: Record<string, string | null | undefined>) {
  return html.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (_, key) => {
    const v = vars[key]
    return (v ?? '').toString()
  })
}

type Ctx = {
  lead?: { first_name?: string; last_name?: string; company?: string; email?: string };
  campaign?: { name?: string };
  user?: { sender_name?: string };
  signatureHtml?: string | null;
};

export function renderTemplate(html: string, ctx: Ctx) {
  const dict: Record<string, string> = {
    first_name: ctx.lead?.first_name || "",
    last_name: ctx.lead?.last_name || "",
    company: ctx.lead?.company || "",
    email: ctx.lead?.email || "",
    campaign: ctx.campaign?.name || "",
    sender_name: ctx.user?.sender_name || "",
  };
  const out = html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => dict[k] ?? "");
  return ctx.signatureHtml ? `${out}<br><br>${ctx.signatureHtml}` : out;
}

