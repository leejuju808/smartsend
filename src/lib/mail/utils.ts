export function normalizeSubject(s?: string | null) {
  return (s ?? "").replace(/^(re:|fwd:)\s*/ig, "").trim();
}

export function trimQuotedEmail(txt: string) {
  if (!txt) return "";
  const lines = txt.split(/\r?\n/);
  const out: string[] = [];
  for (const ln of lines) {
    if (/^\s*On .+wrote:$/i.test(ln)) break;
    if (/^\s*>/.test(ln)) continue;
    if (/^\s*(From|Sent|To|Subject):/i.test(ln)) continue;
    out.push(ln);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
}

