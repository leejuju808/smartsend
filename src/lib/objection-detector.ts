export type Objection =
  | "price"
  | "not_interested"
  | "send_more_info"
  | "bad_timing"
  | "already_using"
  | "who_are_you";

const RULES: Record<Objection, RegExp[]> = {
  price: [
    /\b(budget|price|expensive|too much|cost|pricing)\b/i,
    /\b(out of budget|tight budget|can'?t afford)\b/i,
  ],
  not_interested: [/\b(not interested|pass for now|no thanks|we'?re good)\b/i],
  send_more_info: [/\b(send|share).*(info|information|details|deck|doc|pdf)\b/i],
  bad_timing: [/\b(later|next quarter|q[1-4]|revisit|busy|swamped|circle back)\b/i],
  already_using: [/\b(already (use|using)|have.*(tool|solution|vendor|provider))\b/i],
  who_are_you: [/\b(who are you|what do you do|what is smartsendai)\b/i],
};

export function detectObjections(text: string): Objection[] {
  if (!text) return [];
  const found = new Set<Objection>();
  for (const [key, regs] of Object.entries(RULES) as [Objection, RegExp[]][]) {
    if (regs.some(r => r.test(text))) found.add(key);
  }
  return [...found];
} 