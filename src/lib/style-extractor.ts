export type StyleVector = {
  avg_sentence_len?: number;      // words per sentence
  exclam_rate?: number;           // exclamations / sentence
  emoji_rate?: number;            // emojis / sentence
  greeting?: "hi" | "hey" | "hello" | "none";
  signoff?: "best" | "thanks" | "cheers" | "none";
  formality?: "casual" | "neutral" | "formal";
  cta_style?: "direct" | "soft";  // e.g., "Book here:" vs "Would you be open to..."
};

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}]/u;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

export function extractStyleSample(text: string): StyleVector {
  if (!text) return {};
  const clean = text.trim();
  const sentences = clean.split(SENTENCE_SPLIT).filter(Boolean);
  const words = clean.split(/\s+/).filter(Boolean);

  const avg_sentence_len = sentences.length ? words.length / sentences.length : words.length;
  const exclam_rate = sentences.length ? (clean.match(/!/g)?.length || 0) / sentences.length : 0;
  const emoji_rate = sentences.length ? (clean.match(EMOJI_RE)?.length || 0) / sentences.length : 0;

  // greeting (first 2 lines)
  const first = clean.split(/\n/)[0]?.toLowerCase() || "";
  const greeting = first.startsWith("hi ") ? "hi"
                 : first.startsWith("hey ") ? "hey"
                 : first.startsWith("hello ") ? "hello"
                 : "none";

  // signoff (last 3 lines)
  const lines = clean.split(/\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const lastLines = lines.slice(-3).join(" ");
  const signoff = /\bbest\b/.test(lastLines) ? "best"
               : /\bthanks|thank you\b/.test(lastLines) ? "thanks"
               : /\bcheers\b/.test(lastLines) ? "cheers"
               : "none";

  // crude formality from contractions & pronouns/politeness
  const contractions = (clean.match(/\b(I'm|it's|we're|don't|can't|won't|that's|you're|I've)\b/gi)?.length || 0);
  const politeness = (clean.match(/\b(please|would you|could you|appreciate|thanks)\b/gi)?.length || 0);
  const formality = contractions > 2 && politeness < 1 ? "casual"
                   : politeness > 1 ? "formal"
                   : "neutral";

  // CTA style: direct "Book here/Grab a time" vs soft "open to/ would you"
  const directCta = /\b(book|grab a time|schedule here|calendar|calendly)\b/i.test(clean);
  const softCta = /\b(open to|would you|if helpful|happy to)\b/i.test(clean);
  const cta_style = directCta && !softCta ? "direct" : softCta && !directCta ? "soft" : "direct";

  return { avg_sentence_len, exclam_rate, emoji_rate, greeting, signoff, formality, cta_style };
}

export function mergeStyles(a: StyleVector, b: StyleVector): StyleVector {
  // weighted moving average for numeric, last-observed wins for categoricals if present
  const n = (x?: number) => (typeof x === "number" ? x : undefined);
  const avg = (x?: number, y?: number) => (n(x) && n(y)) ? (x! * 0.7 + y! * 0.3) : (n(y) ?? n(x));
  return {
    avg_sentence_len: avg(a.avg_sentence_len, b.avg_sentence_len),
    exclam_rate:      avg(a.exclam_rate,      b.exclam_rate),
    emoji_rate:       avg(a.emoji_rate,       b.emoji_rate),
    greeting:   b.greeting   ?? a.greeting,
    signoff:    b.signoff    ?? a.signoff,
    formality:  b.formality  ?? a.formality,
    cta_style:  b.cta_style  ?? a.cta_style,
  };
} 