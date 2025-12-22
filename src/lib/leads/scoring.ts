export interface LeadEvent {
  opens: number;
  clicks: number;
  replies: number;
  tags: string[];
}

export interface ScoringRule {
  eventType: string;
  points: number;
  description: string;
}

export interface TagBonus {
  tag: string;
  points: number;
  description: string;
}

// Default scoring rules
export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { eventType: 'open', points: 1, description: 'Email opened' },
  { eventType: 'click', points: 3, description: 'Link clicked' },
  { eventType: 'reply', points: 10, description: 'Email replied to' },
];

// Default tag bonuses
export const DEFAULT_TAG_BONUSES: TagBonus[] = [
  { tag: 'hot_lead', points: 15, description: 'Hot lead indicator' },
  { tag: 'vip', points: 25, description: 'VIP contact' },
  { tag: 'decision_maker', points: 20, description: 'Decision maker' },
  { tag: 'prospect', points: 5, description: 'Qualified prospect' },
];

/**
 * Calculate lead score based on events and tags
 */
export function calculateScore(events: LeadEvent, customRules?: ScoringRule[], customTags?: TagBonus[]): number {
  const rules = customRules || DEFAULT_SCORING_RULES;
  const tagBonuses = customTags || DEFAULT_TAG_BONUSES;
  
  let score = 0;
  
  // Apply event-based scoring
  rules.forEach(rule => {
    switch (rule.eventType) {
      case 'open':
        score += events.opens * rule.points;
        break;
      case 'click':
        score += events.clicks * rule.points;
        break;
      case 'reply':
        score += events.replies * rule.points;
        break;
    }
  });
  
  // Apply tag bonuses
  events.tags.forEach(tag => {
    const bonus = tagBonuses.find(t => t.tag === tag);
    if (bonus) {
      score += bonus.points;
    }
  });
  
  return score;
}

/**
 * Get scoring breakdown for debugging/display
 */
export function getScoreBreakdown(events: LeadEvent, customRules?: ScoringRule[], customTags?: TagBonus[]) {
  const rules = customRules || DEFAULT_SCORING_RULES;
  const tagBonuses = customTags || DEFAULT_TAG_BONUSES;
  
  const breakdown = {
    events: {} as Record<string, number>,
    tags: {} as Record<string, number>,
    total: 0
  };
  
  // Event breakdown
  rules.forEach(rule => {
    switch (rule.eventType) {
      case 'open':
        breakdown.events[rule.eventType] = events.opens * rule.points;
        break;
      case 'click':
        breakdown.events[rule.eventType] = events.clicks * rule.points;
        break;
      case 'reply':
        breakdown.events[rule.eventType] = events.replies * rule.points;
        break;
    }
  });
  
  // Tag breakdown
  events.tags.forEach(tag => {
    const bonus = tagBonuses.find(t => t.tag === tag);
    if (bonus) {
      breakdown.tags[tag] = bonus.points;
    }
  });
  
  // Calculate total
  breakdown.total = Object.values(breakdown.events).reduce((sum, val) => sum + val, 0) +
                   Object.values(breakdown.tags).reduce((sum, val) => sum + val, 0);
  
  return breakdown;
}

/**
 * Validate scoring rules
 */
export function validateScoringRules(rules: ScoringRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  rules.forEach((rule, index) => {
    if (!rule.eventType) {
      errors.push(`Rule ${index + 1}: Missing eventType`);
    }
    if (typeof rule.points !== 'number' || rule.points < 0) {
      errors.push(`Rule ${index + 1}: Points must be a non-negative number`);
    }
    if (!rule.description) {
      errors.push(`Rule ${index + 1}: Missing description`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get score tier based on total score
 */
export function getScoreTier(score: number): string {
  if (score >= 50) return 'Hot Lead';
  if (score >= 30) return 'Warm Lead';
  if (score >= 15) return 'Qualified Lead';
  if (score >= 5) return 'Engaged Contact';
  return 'New Contact';
}

/**
 * Get score color for UI display
 */
export function getScoreColor(score: number): string {
  if (score >= 50) return 'text-red-600';
  if (score >= 30) return 'text-orange-600';
  if (score >= 15) return 'text-yellow-600';
  if (score >= 5) return 'text-blue-600';
  return 'text-gray-600';
} 