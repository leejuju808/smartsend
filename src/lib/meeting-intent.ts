const KEYWORDS = [
  "call","calls","phone","meet","meeting","meetup","schedule","chat",
  "zoom","teams","google meet","gmeet","hangout","calendar","book a time","hop on"
];

export function hasMeetingIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  let score = 0;
  for (const k of KEYWORDS) {
    if (t.includes(k)) score += 1;
  }
  return score >= 2;
}

