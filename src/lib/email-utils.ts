/**
 * Email utility functions for processing email bodies
 */

/**
 * Trim quoted email content from a text body
 * Strips common reply separators and quoted blocks
 */
export function trimQuotedEmail(txt: string): string {
  if (!txt) return "";

  // strip common reply separators + quoted blocks
  const lines = txt.split(/\r?\n/);
  const cleaned: string[] = [];

  for (const ln of lines) {
    // skip "On Tue, … wrote:" blocks and forwarded headers
    if (/^\s*On .+wrote:$/i.test(ln)) break;
    if (/^\s*From:\s|^\s*Sent:\s|^\s*To:\s|^\s*Subject:\s/i.test(ln)) continue;
    if (/^\s*>/.test(ln)) continue; // quoted lines
    cleaned.push(ln);
  }

  let out = cleaned.join("\n").trim();

  // collapse excessive blank lines
  out = out.replace(/\n{3,}/g, "\n\n");
  // guard very long outputs
  if (out.length > 8000) out = out.slice(0, 8000) + "…";
  return out;
}

/**
 * Extract and normalize email address from a "From" header
 * Handles both "Name <email@domain.com>" and plain "email@domain.com" formats
 */
export function normalizeEmailAddress(from?: string | null): string {
  if (!from) return "";
  const match = from.match(/<(.+?)>/);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return from.toLowerCase();
}

/**
 * Normalize email subject by removing common prefixes
 */
export function normalizeSubject(subject?: string | null): string {
  if (!subject) return "";
  return subject.replace(/^(re:|fwd:)\s*/ig, "").trim();
}

