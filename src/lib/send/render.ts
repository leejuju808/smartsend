// Super-light token replace: {{first_name}}, {{company}}, etc.
export function applyVars(input: string, vars: Record<string, string | null | undefined>) {
  return input.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, key) => {
    const v = vars?.[key];
    return (v ?? "").toString();
  });
}

// Minimal Markdown → HTML (headings, bold, italic, links, paragraphs)
export function mdToHtml(md: string) {
  let h = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/^###### (.*)$/gm, "<h6>$1</h6>")
       .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
       .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
       .replace(/^### (.*)$/gm, "<h3>$1</h3>")
       .replace(/^## (.*)$/gm, "<h2>$1</h2>")
       .replace(/^# (.*)$/gm, "<h1>$1</h1>")
       .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
       .replace(/\*(.+?)\*/g, "<em>$1</em>")
       .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noreferrer">$1</a>`)
       .replace(/\n{2,}/g, "</p><p>");
  return `<p>${h}</p>`;
}

export function renderEmail(subjectTpl: string, bodyMdTpl: string, vars: Record<string,string|undefined|null>) {
  const subject = applyVars(subjectTpl, vars);
  const bodyMd  = applyVars(bodyMdTpl, vars);
  const html    = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto;line-height:1.5;">
    ${mdToHtml(bodyMd)}
  </body></html>`;
  return { subject, html };
}

