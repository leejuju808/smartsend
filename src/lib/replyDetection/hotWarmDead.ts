export type HotWarmDead = "hot" | "warm" | "dead";

/**
 * Rules-based reply classification v1.
 *
 * Requirements:
 * - Hot: “yes”, “interested”, “call”, “quote”, “estimate”
 * - Warm: questions, timing, “maybe”, price checks
 * - Dead: “not interested”, “stop”, “unsubscribe”
 */
export function classifyReplyHotWarmDeadV1(text: string): HotWarmDead {
  const t = normalize(text);

  // Dead first (strongest stop signal)
  if (
    hasAny(t, [
      "not interested",
      "no interest",
      "stop",
      "unsubscribe",
      "remove me",
      "take me off",
      "do not contact",
      "don't contact",
      "dont contact",
      "opt out",
    ])
  ) {
    return "dead";
  }

  // Hot (clear buying intent)
  if (
    hasWord(t, "yes") ||
    hasAny(t, [
      "interested",
      "let's do it",
      "lets do it",
      "call",
      "phone",
      "quote",
      "estimate",
      "bid",
      "pricing",
      "price",
      "send me a quote",
      "send a quote",
      "can you send a quote",
      "schedule a call",
      "book a call",
    ])
  ) {
    return "hot";
  }

  // Warm (questions / timing / maybe)
  if (
    t.includes("?") ||
    hasAny(t, [
      "maybe",
      "not sure",
      "how much",
      "cost",
      "pricing",
      "price",
      "when",
      "timing",
      "next week",
      "next month",
      "later",
      "follow up",
      "can you",
      "could you",
      "what's the",
      "whats the",
    ])
  ) {
    return "warm";
  }

  // Default conservative: warm (it is a reply and we should surface it)
  return "warm";
}

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

function hasWord(hay: string, word: string) {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
  return re.test(hay);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}








