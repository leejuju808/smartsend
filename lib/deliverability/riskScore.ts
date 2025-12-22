// lib/deliverability/riskScore.ts
// Content risk scorer (cheap heuristics, fast)

export function riskScore(subject: string, body: string): number {
  let score = 0; // 0 safe → 1 risky

  // basic signals
  const caps = (subject + body).match(/[A-Z]{8,}/g)?.length ?? 0;
  const bangs = (subject + body).match(/!{2,}/g)?.length ?? 0;
  const links = (body.match(/https?:\/\//g) || []).length;
  const images = (body.match(/<img|data:image|cid:/gi) || []).length;

  // spammy words (light list; expand later)
  const bad = /(free money|act now|limited time|guarantee|winner|earn \$|risk[-\s]?free)/i.test(subject + body) ? 1 : 0;

  // weights (tuned later)
  score += Math.min(0.25, caps * 0.05);
  score += Math.min(0.15, bangs * 0.05);
  score += Math.min(0.20, Math.max(0, links - 3) * 0.05);
  score += Math.min(0.10, images * 0.05);
  score += bad ? 0.25 : 0;

  // long subject/body penalties
  if (subject.length > 100) score += 0.05;
  if (body.length > 2500) score += 0.05;

  return Math.max(0, Math.min(1, score));
}















