// lib/deliverability/spamRiskScore.ts
// Enhanced spam word risk detector (0-100 score)

/**
 * High-risk spam keywords that trigger warnings
 */
const SPAM_KEYWORDS = [
  'free',
  'guaranteed',
  'act now',
  'urgent',
  'amazing offer',
  'limited time',
  'cheap',
  'free money',
  'winner',
  'earn $',
  'risk-free',
  'no obligation',
  'click here',
  'buy now',
  'limited offer',
  'exclusive deal',
  'once in a lifetime',
  'act fast',
  'don\'t delete',
  'congratulations',
  'you\'ve won',
  'claim now',
  'expires soon',
  'order now',
  'special promotion',
] as const;

/**
 * Calculate spam risk score (0-100)
 * 0 = safe, 100 = very risky
 * 
 * @param subject Email subject
 * @param body Email body (HTML or text)
 * @returns Risk score 0-100 and list of detected high-risk words
 */
export function spamRiskScore(
  subject: string,
  body: string
): { score: number; highRiskWords: string[] } {
  const text = `${subject} ${body}`.toLowerCase();
  let score = 0;
  const detectedWords: string[] = [];

  // Check for spam keywords
  for (const keyword of SPAM_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(text)) {
      detectedWords.push(keyword);
      score += 5; // 5 points per keyword
    }
  }

  // Excessive capitalization (ALL CAPS)
  const capsMatches = text.match(/[A-Z]{8,}/g);
  if (capsMatches) {
    score += Math.min(15, capsMatches.length * 3);
  }

  // Excessive exclamation marks
  const bangMatches = text.match(/!{2,}/g);
  if (bangMatches) {
    score += Math.min(10, bangMatches.length * 2);
  }

  // Too many links
  const linkMatches = text.match(/https?:\/\//g);
  if (linkMatches) {
    const excessLinks = Math.max(0, linkMatches.length - 3);
    score += Math.min(15, excessLinks * 3);
  }

  // Too many images
  const imageMatches = text.match(/<img|data:image|cid:/gi);
  if (imageMatches) {
    score += Math.min(10, imageMatches.length * 2);
  }

  // Subject line too long
  if (subject.length > 100) {
    score += 5;
  }

  // Body too long
  if (body.length > 2500) {
    score += 5;
  }

  // Subject line too short (spam indicator)
  if (subject.length < 5) {
    score += 5;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    highRiskWords: [...new Set(detectedWords)], // Remove duplicates
  };
}

/**
 * Check if template is high risk
 * @param subject Email subject
 * @param body Email body
 * @returns true if risk score > 60
 */
export function isHighRiskTemplate(subject: string, body: string): boolean {
  const { score } = spamRiskScore(subject, body);
  return score > 60;
}

/**
 * Get risk level category
 * @param score Risk score 0-100
 * @returns Risk level category
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= 30) return 'low';
  if (score <= 60) return 'medium';
  return 'high';
}










