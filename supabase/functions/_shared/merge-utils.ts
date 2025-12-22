export function extractTokens(s: string): string[] {
  const re = /{{\s*([a-zA-Z0-9_\.]+)\s*}}/g;
  const out = new Set<string>();
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return [...out];
}

export function tokensPreserved(
  baseSub: string,
  baseHtml: string,
  newSub: string,
  newHtml: string
): boolean {
  const need = new Set([
    ...extractTokens(baseSub),
    ...extractTokens(baseHtml)
  ]);
  const got = new Set([
    ...extractTokens(newSub || ""),
    ...extractTokens(newHtml || "")
  ]);
  for (const t of need) if (!got.has(t)) return false;
  return true;
}

const BAD = [
  "free!!!",
  "viagra",
  "urgent reply",
  "wire transfer",
  "limited time only",
  "act now",
  "risk-free",
  "100% free",
  "winner",
  "guarantee"
];

export function spamScore(sub: string, html: string): number {
  const text = (sub + " " + html.replace(/<[^>]+>/g, " ")).toLowerCase();
  let hits = 0;
  for (const w of BAD) if (text.includes(w)) hits++;
  const exclam = (text.match(/!/g) || []).length;
  const ALLCAPS = /([A-Z]{6,})/.test(sub);
  return Math.min(1, hits * 0.25 + (exclam > 3 ? 0.15 : 0) + (ALLCAPS ? 0.15 : 0));
}











