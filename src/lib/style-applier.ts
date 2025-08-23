import type { StyleVector } from "./style-extractor";

export function applyStyle(draft: string, s: StyleVector): string {
  let txt = draft;

  // Sentence length nudging (very light-touch)
  if (s.avg_sentence_len && s.avg_sentence_len < 10) {
    // user is punchy => try to split long lines after ~18-22 words
    txt = txt.replace(/(.{18,22}\S+)\s/g, "$1.\n");
  } else if (s.avg_sentence_len && s.avg_sentence_len > 24) {
    // user writes long => join short lines to flow
    txt = txt.replace(/\n(?!\n)/g, " ");
  }

  // Exclamation / emoji rate
  if ((s.exclam_rate ?? 0) === 0) {
    txt = txt.replace(/!+/g, "."); // tone down
  } else if ((s.exclam_rate ?? 0) > 0.6) {
    // let one exclamation survive at paragraph ends
    txt = txt.replace(/\.(\n|$)/g, "!$1");
  }
  if ((s.emoji_rate ?? 0) === 0) {
    txt = txt.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  }

  // Greeting
  if (s.greeting && s.greeting !== "none") {
    txt = txt.replace(/^(hi|hey|hello)\b.*\n/i, ""); // remove existing greeting if present
    const cap = s.greeting.charAt(0).toUpperCase() + s.greeting.slice(1);
    txt = `${cap} {{first_name}},\n\n${txt}`;
  }

  // Signoff
  if (s.signoff && s.signoff !== "none") {
    txt = txt.replace(/\n(?:best|thanks|cheers)[\s,]*\n.*$/i, "");
    const map: any = { best: "Best", thanks: "Thanks", cheers: "Cheers" };
    const label = map[s.signoff] || "Best";
    txt = `${txt}\n\n${label},\n{{my_name}}`;
  }

  // Formality tweak
  if (s.formality === "formal") {
    txt = txt.replace(/\b(let's|we're|it's|can't|won't|don't|you're|I'm)\b/gi, (m) => {
      const map: any = {
        "let's": "let us", "we're": "we are", "it's": "it is", "can't": "cannot",
        "won't": "will not", "don't": "do not", "you're": "you are", "I'm": "I am",
      };
      return map[m.toLowerCase()] || m;
    });
  } else if (s.formality === "casual") {
    // add a friendly softener occasionally
    txt = txt.replace(/\b(If|Would)\b/g, "Maybe");
  }

  // CTA phrasing
  if (s.cta_style === "direct") {
    txt = txt.replace(/\b(open to|would you be open to|if helpful)\b.*\?/i, "Book a time here:");
  } else {
    txt = txt.replace(/\b(Book a time here:)\b/i, "Would you be open to 15 min?");
  }

  return txt;
} 