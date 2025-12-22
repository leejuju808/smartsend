export type IntentResult = {
  isMeeting: boolean;
  score: number;
  matches: string[];
  reasons: string[];
  model?: 'heuristic' | 'llm';
};

const KW = [
  'call','meet','meeting','schedule','calendar','calendly',
  'zoom','google meet','gmeet','teams','videocall','video call',
  'chat','connect','book','availability','available',
  'this week','next week','today','tomorrow',
  'monday','tuesday','wednesday','thursday','friday',
  'morning','afternoon','evening','works for me','what time','set up',
  'let\'s talk','lets talk','hop on','jump on','time works'
];

function heuristicScore(text: string): IntentResult {
  const t = text.toLowerCase();
  const matches = KW.filter(k => t.includes(k));
  let score = 0;

  // Base scoring
  score += matches.length * 10;

  // Phrases that strongly imply booking
  const strong = [
    /can we (?:meet|talk|chat|schedule)/i,
    /let'?s (?:meet|talk|chat|schedule)/i,
    /send (?:a )?calendar (?:invite|invitation)/i,
    /book (?:a )?(?:time|slot|call)/i,
    /(works|work) (?:for|with) (?:me|you)/i
  ];
  strong.forEach(rx => { if (rx.test(t)) score += 20; });

  // Days/timing boost
  if (/(mon|tue|wed|thu|fri|sat|sun)/i.test(t)) score += 8;
  if (/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i.test(t)) score += 8;

  // Negations
  if (/not (?:ready|interested)/i.test(t)) score -= 15;

  const isMeeting = score >= 20; // tuned for high precision
  const reasons = [
    matches.length ? `Matched keywords: ${matches.join(', ')}` : 'Few/no meeting keywords matched',
    `Score=${score} (>=20 => meeting intent)`,
  ];
  return { isMeeting, score, matches, reasons, model: 'heuristic' };
}

async function llmAssist(text: string): Promise<IntentResult | null> {
  if (process.env.REPLY_INTENT_USE_LLM !== '1' || !process.env.OPENAI_API_KEY) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You classify if an email reply is asking to schedule a meeting/call. Output JSON: {"meeting_intent": true|false, "confidence": 0-1, "reasons": ["..."]}.' },
          { role: 'user', content: `Email reply:\n${text}` }
        ]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    return {
      isMeeting: !!parsed.meeting_intent,
      score: typeof parsed.confidence === 'number' ? Math.round(parsed.confidence * 100) : 0,
      matches: [],
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      model: 'llm'
    };
  } catch {
    return null;
  }
}

export async function detectReplyIntent(text: string): Promise<IntentResult> {
  // Start with heuristic; optionally confirm with LLM if available and heuristic is borderline
  const base = heuristicScore(text);
  if (!base.isMeeting && base.score >= 12) {
    const assisted = await llmAssist(text);
    if (assisted) return assisted;
  }
  return base;
}

