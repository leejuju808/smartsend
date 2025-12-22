// Minimal DSN/SMTP parser to classify hard vs soft bounces.
export type ParsedBounce = {
  kind: "hard" | "soft";
  smtpStatus?: string;
  diagnostic?: string;
  recipient?: string;
};

const HARD_PATTERNS = [
  /5\.1\.1|user unknown|no such user|mailbox unavailable/i,
  /address rejected|recipient address rejected/i,
  /account disabled|does not exist/i,
  /\b(550|551|552)\b.*(user|mailbox|recipient)/i,
];

const SOFT_PATTERNS = [
  /4\.\d\.\d/i,
  /mailbox full|over quota/i,
  /temporar(y|ily) unavailable|rate limit/i,
  /\b(421|450|451|452)\b/i,
];

export function parseBounce(text: string): ParsedBounce {
  const normalized = text || "";
  const firstLine = normalized.split(/\r?\n/)[0]?.slice(0, 200);

  const smtp = normalized.match(/\b\d{3}\s+\d\.\d\.\d\b/)?.[0]
            || normalized.match(/\b\d{3}\b/)?.[0]
            || undefined;

  const rcpt = normalized.match(/Final-Recipient:\s*(?:rfc822;)?\s*([^\s\n]+)/i)?.[1]
           || normalized.match(/Original-Recipient:\s*(?:rfc822;)?\s*([^\s\n]+)/i)?.[1]
           || normalized.match(/Recipient:\s*([^\s\n]+)/i)?.[1]
           || undefined;

  const diagnostic = normalized.match(/Diagnostic-Code:[\s\S]*?(?=\n[A-Z][a-zA-Z-]+:|\n\n|$)/i)?.[0]
                  || firstLine;

  const isHard = HARD_PATTERNS.some(re => re.test(normalized));
  const isSoft = SOFT_PATTERNS.some(re => re.test(normalized));

  return {
    kind: isHard ? "hard" : isSoft ? "soft" : (smtp?.startsWith("5") ? "hard" : "soft"),
    smtpStatus: smtp,
    diagnostic,
    recipient: rcpt
  };
} 