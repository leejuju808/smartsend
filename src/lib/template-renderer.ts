/**
 * Template rendering utilities for email templates
 * Supports variable expansion and spintax for A/B testing
 */

/**
 * Expand variables in template (e.g., {{first_name}} -> "John")
 */
export function expandVars(md: string, vars: Record<string, string>): string {
  return md.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/**
 * Expand spintax syntax: {option1|option2|option3} -> randomly picks one
 */
export function spintax(s: string): string {
  return s.replace(/\{([^{}]+)\}/g, (_, choices) => {
    const opts = choices.split("|");
    return opts[Math.floor(Math.random() * opts.length)] || "";
  });
}

/**
 * Render template for a lead: expand variables, then apply spintax
 */
export function renderForLead(md: string, lead: any): string {
  const withVars = expandVars(md, {
    first_name: lead.first_name || "",
    company: lead.company || "",
    role: lead.role || "",
    pain_point: lead.pain_point || "",
    value_prop: lead.value_prop || "",
    // Support custom fields
    ...(lead.custom_fields || {}),
  });
  return spintax(withVars);
}

/**
 * Extract all variable names from a template
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const vars = new Set<string>();
  for (const match of matches) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}

/**
 * Convert markdown to HTML for email compatibility
 * Simple implementation - preserves variables like {{first_name}}
 */
export function markdownToHtml(md: string): string {
  // First, preserve variables by temporarily replacing them
  const varMap = new Map<string, string>();
  let varCounter = 0;
  let processed = md.replace(/\{\{(\w+)\}\}/g, (match) => {
    const key = `__VAR_${varCounter++}__`;
    varMap.set(key, match);
    return key;
  });

  // Convert markdown to HTML
  let html = processed
    // Bold: **text** -> <strong>text</strong>
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* -> <em>text</em>
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links: [text](url) -> <a href="url">text</a>
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Paragraphs: double newlines -> </p><p>
    .split(/\n{2,}/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      // Single newlines within paragraphs -> <br>
      const withBreaks = trimmed.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join('');

  // Restore variables
  varMap.forEach((value, key) => {
    html = html.replace(new RegExp(key, 'g'), value);
  });

  return html;
}

/**
 * Convert markdown to plaintext (for email text fallback)
 */
export function markdownToPlaintext(md: string): string {
  return md
    // Remove markdown formatting
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

