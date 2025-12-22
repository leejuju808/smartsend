/**
 * Heuristic scoring for email sequence steps
 * Scores from 0-100 based on best practices for cold email outreach
 */

export interface ScoreResult {
  score: number
  notes: string
}

export function scoreStep(subject: string | null | undefined, body: string | null | undefined): ScoreResult {
  const subj = (subject || '').trim()
  const bodyText = (body || '').trim()
  
  let score = 0
  const notes: string[] = []

  // Subject scoring (0-40 points)
  const subjectLen = subj.length
  if (subjectLen >= 20 && subjectLen <= 45) {
    score += 10
    notes.push('Subject length ideal')
  } else if (subjectLen > 0) {
    notes.push('Subject length outside ideal range (20-45 chars)')
  }

  if (subjectLen > 0 && subjectLen <= 60) {
    score += 5
  }

  // First line scoring (0-20 points)
  const firstLine = bodyText.split('\n')[0]?.trim() || ''
  const firstLineLen = firstLine.length
  if (firstLineLen > 0 && firstLineLen <= 120) {
    score += 10
    notes.push('First line concise')
  } else if (firstLineLen > 120) {
    notes.push('First line too long (>120 chars)')
  }

  // Spam word detection (0-20 points)
  const spamWords = ['free', 'click here', 'guaranteed', 'act now', 'limited time', '!!!', '$$$']
  const hasSpamWords = spamWords.some(word => 
    subj.toLowerCase().includes(word.toLowerCase()) || 
    bodyText.toLowerCase().includes(word.toLowerCase())
  )
  if (!hasSpamWords) {
    score += 10
    notes.push('No spammy words detected')
  } else {
    notes.push('Contains potentially spammy words')
  }

  // Variable presence (0-10 points)
  const hasVariables = /\{\{[^}]+\}\}/.test(subj) || /\{\{[^}]+\}\}/.test(bodyText)
  if (hasVariables) {
    score += 10
    notes.push('Contains personalization variables')
  } else {
    notes.push('No personalization variables found')
  }

  // CTA detection (0-10 points)
  const ctaPatterns = [
    /\?/,
    /(call|email|reach|connect|schedule|book)/i,
    /(reply|respond|let me know)/i
  ]
  const hasCTA = ctaPatterns.some(pattern => pattern.test(bodyText))
  const ctaCount = ctaPatterns.filter(pattern => pattern.test(bodyText)).length
  if (hasCTA && ctaCount <= 2) {
    score += 10
    notes.push('Clear CTA present')
  } else if (ctaCount > 2) {
    notes.push('Multiple CTAs may reduce effectiveness')
  } else {
    notes.push('No clear CTA found')
  }

  // Unsubscribe link for later steps (bonus)
  if (bodyText.includes('%UNSUB%') || bodyText.includes('unsubscribe') || bodyText.includes('opt-out')) {
    score += 5
    notes.push('Unsubscribe option included')
  }

  // Cap at 100
  score = Math.min(score, 100)

  // Generate badge level
  let badge = 'Poor'
  if (score >= 80) badge = 'Good'
  else if (score >= 60) badge = 'Okay'
  
  const noteText = notes.length > 0 
    ? `${badge} (${notes.slice(0, 3).join('; ')})`
    : `${badge} (${score}/100)`

  return {
    score,
    notes: noteText
  }
}

