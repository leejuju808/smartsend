// deno-lint-ignore-file no-explicit-any

export function looksLikeBounce(from: string | null, subject: string | null, headers?: Record<string, string>) {
  const s = (subject || "").toLowerCase();
  const f = (from || "").toLowerCase();
  if (f.includes("mailer-daemon") || f.includes("postmaster")) return true;
  if (s.includes("delivery status notification") || s.startsWith("undeliverable")) return true;
  if (headers?.["x-failed-recipients"]) return true;
  return false;
}

export function extractHtml(body: { html?: string; text?: string } | string): string {
  if (typeof body === "string") return body;
  if (body?.html) return body.html;
  if (body?.text) return `<pre>${escapeHtml(body.text)}</pre>`;
  return "";
}

function escapeHtml(t: string) {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}











