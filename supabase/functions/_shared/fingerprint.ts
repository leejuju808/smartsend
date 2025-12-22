// deno-lint-ignore-file no-explicit-any
import { sanitizeEmailBody } from "./sanitize_email.ts";

type NormalizeInput = {
  subject?: string | null;
  plaintext?: string | null;
  html?: string | null;
};

/** Minimal normalization so templated OOO collapses to stable string. */
export function normalizeForHash(input: NormalizeInput) {
  const subject = (input.subject ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/re:\s*/g, "")
    .trim();

  const text = sanitizeEmailBody({
    plaintext: input.plaintext ?? undefined,
    html: input.html ?? undefined,
  })
    .toLowerCase()
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, "<day>")
    .replace(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\b/g,
      "<mon>",
    )
    .replace(/\b(20)?\d{2}\b/g, "<year>")
    .replace(/\b\d{1,2}:\d{2}(\s?(am|pm))?\b/g, "<time>")
    .replace(/\b\d{1,2}([\/.-])\d{1,2}([\/.-])(20)?\d{2}\b/g, "<date>")
    .replace(/\b(?:until|back|returning)\s+(?:on\s+)?<mon>\s+\d{1,2}(?:,\s*<year>)?/g, "return_on_<date>")
    .replace(/\s+/g, " ")
    .trim();

  return { subject, text };
}

export async function sha1(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}


