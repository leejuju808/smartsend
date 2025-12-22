export function renderTemplate(str: string, ctx: Record<string, any>) {
  // Supports {{first_name}} and {{company|there}} fallbacks.
  return str.replace(/\{\{\s*([a-zA-Z0-9_.]+)(\|[^}]+)?\s*\}\}/g, (_, key: string, fb: string | undefined) => {
    const fallback = fb ? fb.slice(1) : "";
    const value = key.split(".").reduce((acc: any, k: string) => (acc && acc[k] != null ? acc[k] : undefined), ctx);
    const v = value ?? fallback;
    return (v ?? "").toString();
  });
}

export function htmlWithSignature(html: string, signatureHtml?: string) {
  if (!signatureHtml) return html;
  // Add line break + signature. You can make this smarter later.
  return `${html}\n<br/><br/>\n${signatureHtml}`;
}

export function stripHtml(html: string) {
  // quick & dirty plain-text
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim();
}
