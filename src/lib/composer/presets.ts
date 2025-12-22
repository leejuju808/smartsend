export const TONES = {
  friendly: {
    system: 'You write concise, warm outreach. You avoid hype. You keep sentences short. You personalize with first name when available. British level of politeness, US brevity.',
  },
  direct: {
    system: 'You write crisp, no‑fluff outreach with clear value and one call to action. Avoid adjectives. One idea per sentence.',
  },
  casual: {
    system: 'You write conversational outreach. Lowercase ok. Use contractions. Keep it human.',
  },
  professional: {
    system: 'You write formal, clear outreach in standard business tone. Avoid slang. Keep to 3–5 sentences.',
  },
};

export function detectVars(text: string) {
  // collect {{placeholders}}
  const found = new Set<string>();
  for (const m of text.matchAll(/{{\s*([\w.]+)\s*}}/g)) found.add(m[1]);
  // suggest common contact fields
  const common = ['contact.first_name', 'contact.last_name', 'company.name', 'sender.first_name'];
  for (const c of common) found.add(c);
  return Array.from(found);
} 