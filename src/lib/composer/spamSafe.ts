const BAD_PHRASES = [
  'act now', 'click here', 'buy now', '100% free', 'risk-free', 'guaranteed', 'winner', 'urgent', 'limited time', 'earn $$$', 'no credit check'
];

export function scoreSpammy(text: string) {
  const t = (text || '').toLowerCase();
  let score = 0;
  for (const p of BAD_PHRASES) if (t.includes(p)) score += 1;
  const caps = (text.match(/[A-Z]{4,}/g) || []).length; // shouty chunks
  score += Math.min(3, caps);
  const excls = (text.match(/!/g) || []).length; // exclamation overuse
  score += Math.floor(excls / 3);
  const links = (text.match(/https?:\/\//g) || []).length;
  if (links > 2) score += links - 2;
  const lengthPenalty = text.length > 1200 ? 1 : 0;
  return { score, caps, excls, links, lengthPenalty };
}

export function rewriteSafer(text: string) {
  let out = text
    .replace(/CLICK HERE/gi, 'see more')
    .replace(/ACT NOW/gi, 'if it\'s useful, you can proceed')
    .replace(/100% FREE/gi, 'no cost to you')
    .replace(/\s{2,}/g, ' ');
  // soften shouty words
  out = out.replace(/\b([A-Z]{4,})\b/g, (m) => m[0] + m.slice(1).toLowerCase());
  // reduce exclamation noise
  out = out.replace(/!{2,}/g, '!');
  return out;
}

export function tighten(text: string) {
  // crude shortener: limit sentences to ~24 words
  const sents = text.split(/(?<=[.!?])\s+/);
  return sents.map(s => {
    const words = s.split(/\s+/);
    if (words.length <= 24) return s;
    return words.slice(0, 24).join(' ') + '…';
  }).join(' ');
}

export function spamSafePair({ subject, body }: { subject: string; body: string }) {
  const s1 = rewriteSafer(subject);
  const b1 = rewriteSafer(body);
  const b2 = tighten(b1);
  return { subject: s1.trim(), body: b2.trim(), meta: { subjScore: scoreSpammy(s1), bodyScore: scoreSpammy(b2) } };
} 