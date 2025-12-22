/**
 * Human detection for inbound replies
 * Uses fast heuristic by default, can upgrade to OpenAI if key is present
 */

export async function detectHuman(subject: string, bodyText: string): Promise<boolean> {
  // Fast heuristic: check for common bot/AI indicators
  const text = `${subject} ${bodyText}`.toLowerCase();
  
  // Skip obvious bot markers
  const botMarkers = [
    'mail delivery subsystem',
    'mailer-daemon',
    'postmaster',
    'noreply',
    'no-reply',
    'do not reply',
    'automated',
    'auto-reply',
    'out of office',
    'out-of-office',
    'ooo',
    'vacation',
    'automatic reply',
    'delivery failure',
    'delivery status notification',
    'bounce',
    'undelivered mail',
  ];
  
  for (const marker of botMarkers) {
    if (text.includes(marker)) {
      return false;
    }
  }
  
  // Check for personal indicators (human-like content)
  const humanIndicators = [
    /\b(i|we|you|your|my|our|me|us|they|them)\b/i,
    /\?/, // questions
    /!\s*[a-z]/i, // exclamations followed by text
    /\b(thank|thanks|please|hi|hello|hey|sorry|yes|no|sure|ok|okay)\b/i,
  ];
  
  const humanScore = humanIndicators.filter(pattern => pattern.test(text)).length;
  
  // If it looks too automated or empty, likely not human
  if (bodyText.trim().length < 10) {
    return false;
  }
  
  // If we have OpenAI key, use it for more accurate detection
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && bodyText.length > 20) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a classifier that determines if an email reply is from a human or automated system. Respond with only "human" or "bot".',
            },
            {
              role: 'user',
              content: `Subject: ${subject}\n\nBody: ${bodyText.slice(0, 500)}`,
            },
          ],
          temperature: 0,
          max_tokens: 10,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.toLowerCase().trim();
        return result === 'human';
      }
    } catch (e) {
      console.error('OpenAI human detection failed:', e);
      // Fall through to heuristic
    }
  }
  
  // Heuristic: if has personal indicators and not too bot-like, assume human
  return humanScore >= 1;
}

