// lib/content/brandGuardrails.ts
// Brand-aware validator (extends Day-20 guardrails)

export type LimitCfg = { subject_max?: number; body_max?: number };

export type Issue = { code: string; msg: string; loc?: 'subject'|'body' };

export function validateBrand({
  subject,
  body,
  style,
  allow,
  deny,
}: {
  subject: string;
  body: string;
  style: {
    length_limits?: LimitCfg;
    required_tags?: string[];
    can_include_links?: boolean;
    formatting_rules?: string; // optional free text note for LLM
  };
  allow: string[];
  deny: string[];
}): { ok: boolean; issues: Issue[] } {
  const issues: Issue[] = [];

  // Required merge tags
  for (const tag of style.required_tags ?? []) {
    if (!body.includes(tag)) {
      issues.push({ code: 'MISSING_TAG', msg: `Missing ${tag}`, loc: 'body' });
    }
  }

  // Length
  const lim = style.length_limits ?? {};
  if (lim.subject_max && subject.length > lim.subject_max) {
    issues.push({
      code: 'SUBJECT_TOO_LONG',
      msg: `Subject >${lim.subject_max}`,
      loc: 'subject',
    });
  }
  if (lim.body_max && body.length > lim.body_max) {
    issues.push({
      code: 'BODY_TOO_LONG',
      msg: `Body >${lim.body_max}`,
      loc: 'body',
    });
  }

  // Links
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (style.can_include_links === false && linkCount > 0) {
    issues.push({ code: 'LINKS_BLOCKED', msg: 'Links not allowed', loc: 'body' });
  }
  if (linkCount > 3) {
    issues.push({ code: 'TOO_MANY_LINKS', msg: '>3 links', loc: 'body' });
  }

  // ALL CAPS / !!! (deliverability sanity)
  if (/[A-Z]{8,}/.test(subject + body)) {
    issues.push({ code: 'SHOUTING', msg: 'Excessive ALL-CAPS' });
  }
  if (/!{3,}/.test(subject + body)) {
    issues.push({ code: 'BANGS', msg: 'Too many exclamation marks' });
  }

  // Forbidden phrases (deny)
  const denyHit = deny.find((p) =>
    new RegExp(`\\b${escapeRegex(p)}\\b`, 'i').test(subject + ' ' + body),
  );
  if (denyHit) {
    issues.push({ code: 'FORBIDDEN_PHRASE', msg: `Forbidden: "${denyHit}"` });
  }

  return { ok: issues.length === 0, issues };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}















