// deno-lint-ignore-file no-explicit-any
// Minimal, fast cleaner: kills quoted blocks, signatures, legal footers, reply separators.

const REPLY_SEPARATORS = [
  /^On .*wrote:$/i,
  /^Am\s+On.*hat geschrieben:$/i,
  /^Le .* a écrit :$/i,
  /^El .* escribió:$/i,
  /^From:\s?.+$/i,
  /^-----Original Message-----$/i,
  /^--+ ?Forwarded message ?--+$/i,
];

const SIG_HINTS = [
  /^--\s*$/, // Unix signature delimiter
  /^Sent from my (iPhone|Android)/i,
  /^(Best|Regards|Thanks|Sincerely|Cheers),?\s*$/i,
];

const FOOTER_HINTS = [
  /This email .* confidential/i,
  /If you are not the intended recipient/i,
  /Unsubscribe|Manage preferences/i,
];

function stripHtml(html: string) {
  // remove scripts/styles, collapse whitespace
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstLines(text: string, maxChars = 1200) {
  const t = text.trim().slice(0, maxChars);
  return t;
}

function killQuotedBlocks(lines: string[]) {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Gmail/Outlook quote markers
    if (/^>+/.test(line)) break;
    if (
      /^From:\s?.+$/i.test(line) &&
      i + 1 < lines.length &&
      /^Sent:|^Date:/i.test(lines[i + 1] ?? "")
    ) {
      break;
    }
    if (REPLY_SEPARATORS.some((r) => r.test(line.trim()))) break;

    out.push(line);
  }
  return out;
}

function killSignature(lines: string[]) {
  // walk from bottom up until signature hints found, then drop tail
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (SIG_HINTS.some((r) => r.test(l))) {
      cut = i;
      break;
    }
    if (FOOTER_HINTS.some((r) => r.test(l))) {
      cut = i;
      break;
    }
  }
  return lines.slice(0, cut);
}

export function cleanBody({ html, text }: { html?: string | null; text?: string | null }) {
  const raw = text ?? (html ? stripHtml(html) : "");
  const normalized = raw.replace(/\r/g, "").replace(/\t/g, " ").replace(/\u00A0/g, " ");
  const lines = normalized.split("\n").map((s) => s.replace(/\s+$/, ""));

  const noQuoted = killQuotedBlocks(lines);
  const noSig = killSignature(noQuoted);

  const cleaned = noSig.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const preview = firstLines(cleaned, 320); // UI preview
  return { cleaned, preview };
}


