/**
 * Demo Notes Utilities
 * Helper functions for working with SmartSend Roofing Demo CRM Notes
 * 
 * Block 23500 — SmartSend Roofing Demo CRM Notes v1
 */

export type BuyingSignalScore = 1 | 2 | 3 | 4 | 5;

export type InterestLevel = 'hot_lead' | 'warm_lead' | 'not_ready';

export type ServiceType = 'roof_repair' | 'roof_replace' | 'storm_damage' | 'gutters' | 'solar_roof';

export type IdealPlanTarget = 'starter_fit' | 'growth_fit' | 'domination_fit';

export interface DemoNote {
  id: string;
  lead_id: string;
  workspace_id: string;
  created_by?: string;
  company_snapshot: string;
  pain_points: string;
  buying_signal_score: BuyingSignalScore;
  activation_blocker: string;
  full_note_text?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DemoNoteTags {
  id: string;
  demo_note_id: string;
  interest_level?: InterestLevel;
  service_type?: ServiceType;
  ideal_plan_target?: IdealPlanTarget;
  created_at: string;
  updated_at: string;
}

export interface DemoNoteWithTags extends DemoNote {
  demo_note_tags?: DemoNoteTags;
}

export interface DemoNoteForFollowup {
  company_snapshot: string;
  pain_points: string;
  buying_signal_score: number;
  activation_blocker: string;
  interest_level?: string;
  service_type?: string;
  ideal_plan_target?: string;
  city?: string;
  crew_size?: string;
  jobs_per_month?: string;
  primary_service?: string;
}

/**
 * Get buying signal label from score
 */
export function getBuyingSignalLabel(score: BuyingSignalScore): string {
  switch (score) {
    case 1:
      return 'Cold';
    case 2:
      return 'Low interest';
    case 3:
      return 'Warm';
    case 4:
      return 'Hot';
    case 5:
      return 'Fire';
    default:
      return 'Unknown';
  }
}

/**
 * Get interest level from buying signal score
 */
export function getInterestLevelFromScore(score: BuyingSignalScore): InterestLevel {
  if (score >= 4) return 'hot_lead';
  if (score === 3) return 'warm_lead';
  return 'not_ready';
}

/**
 * Format demo note into 4-line text format
 */
export function formatDemoNote(note: DemoNote): string {
  return [
    note.company_snapshot,
    note.pain_points,
    `${note.buying_signal_score}/5 — ${getBuyingSignalLabel(note.buying_signal_score)}`,
    `Blocker: ${note.activation_blocker}`,
  ].join('\n');
}

/**
 * Parse company snapshot to extract structured data
 */
export function parseCompanySnapshot(snapshot: string): {
  city?: string;
  state?: string;
  crewSize?: string;
  jobsPerMonth?: string;
  primaryService?: string;
} {
  const result: ReturnType<typeof parseCompanySnapshot> = {};
  
  // Extract city and state: "City, State — ..."
  const cityStateMatch = snapshot.match(/^([^,]+),\s*([A-Z]{2})\s*—/);
  if (cityStateMatch) {
    result.city = cityStateMatch[1].trim();
    result.state = cityStateMatch[2].trim();
  }
  
  // Extract crew size: "X crews" or "X crew"
  const crewMatch = snapshot.match(/(\d+)\s+crews?/);
  if (crewMatch) {
    result.crewSize = crewMatch[1];
  }
  
  // Extract jobs/month: "Y–Z jobs/mo" or "Y-Z jobs/mo"
  const jobsMatch = snapshot.match(/(\d+)[–-](\d+)\s+jobs?\/mo/);
  if (jobsMatch) {
    result.jobsPerMonth = `${jobsMatch[1]}-${jobsMatch[2]}`;
  }
  
  // Extract primary service (everything after the last "—")
  const serviceMatch = snapshot.split('—');
  if (serviceMatch.length > 1) {
    result.primaryService = serviceMatch[serviceMatch.length - 1].trim();
  }
  
  return result;
}

/**
 * Determine ideal plan target from company snapshot
 */
export function determineIdealPlanTarget(snapshot: string): IdealPlanTarget {
  const parsed = parseCompanySnapshot(snapshot);
  
  if (!parsed.crewSize || !parsed.jobsPerMonth) {
    return 'starter_fit'; // Default to starter if we can't determine
  }
  
  const crewCount = parseInt(parsed.crewSize, 10);
  const jobsRange = parsed.jobsPerMonth.split('-');
  const minJobs = parseInt(jobsRange[0], 10);
  
  // Domination fit: 5+ crews
  if (crewCount >= 5) {
    return 'domination_fit';
  }
  
  // Growth fit: 2-4 crews AND 10+ jobs/month
  if (crewCount >= 2 && crewCount <= 4 && minJobs >= 10) {
    return 'growth_fit';
  }
  
  // Starter fit: 1 crew OR <10 jobs/month
  return 'starter_fit';
}

/**
 * Generate personalized follow-up message using demo note data
 */
export function generateFollowUpMessage(
  note: DemoNoteWithTags,
  template?: string
): string {
  const parsed = parseCompanySnapshot(note.company_snapshot);
  const painPoints = note.pain_points.split(',').map(p => p.trim());
  const interestLevel = note.demo_note_tags?.interest_level || getInterestLevelFromScore(note.buying_signal_score);
  
  // Default template if none provided
  const defaultTemplate = `If you want ${painPoints[0] || 'more jobs'}, SmartSend will ${interestLevel === 'hot_lead' ? 'get your campaign live immediately' : 'help solve your follow-up problem'}.`;
  
  if (!template) {
    return defaultTemplate;
  }
  
  // Replace template variables
  return template
    .replace(/\{\{city\}\}/g, parsed.city || 'your area')
    .replace(/\{\{crew_size\}\}/g, parsed.crewSize || 'your crews')
    .replace(/\{\{jobs_per_month\}\}/g, parsed.jobsPerMonth || 'your jobs')
    .replace(/\{\{primary_service\}\}/g, parsed.primaryService || 'your services')
    .replace(/\{\{pain_point_1\}\}/g, painPoints[0] || 'your challenges')
    .replace(/\{\{pain_point_2\}\}/g, painPoints[1] || '')
    .replace(/\{\{activation_blocker\}\}/g, note.activation_blocker)
    .replace(/\{\{interest_level\}\}/g, interestLevel)
    .replace(/\{\{ideal_plan\}\}/g, note.demo_note_tags?.ideal_plan_target || 'Growth');
}

/**
 * Check if demo note indicates a high-priority lead
 */
export function isHighPriorityLead(note: DemoNote): boolean {
  // High priority if buying signal is 4 or 5
  if (note.buying_signal_score >= 4) {
    return true;
  }
  
  // High priority if pain points include key phrases
  const highPriorityPhrases = [
    "don't follow up",
    "no follow-up",
    "need winter work",
    "trying to grow",
    "losing leads",
    "need more jobs",
  ];
  
  const painPointsLower = note.pain_points.toLowerCase();
  return highPriorityPhrases.some(phrase => painPointsLower.includes(phrase));
}

/**
 * Check if demo note indicates a low-priority lead
 */
export function isLowPriorityLead(note: DemoNote): boolean {
  const lowPriorityPhrases = [
    "don't do email",
    "only door-to-door",
    "scaling solar",
    "don't want more jobs",
  ];
  
  const snapshotLower = note.company_snapshot.toLowerCase();
  const painPointsLower = note.pain_points.toLowerCase();
  const blockerLower = note.activation_blocker.toLowerCase();
  
  const allText = `${snapshotLower} ${painPointsLower} ${blockerLower}`;
  
  return lowPriorityPhrases.some(phrase => allText.includes(phrase));
}

/**
 * Get workflow type from buying signal score
 */
export function getWorkflowType(score: BuyingSignalScore): 'hot_lead' | 'warm_lead' | 'cold_lead' {
  if (score >= 4) return 'hot_lead';
  if (score === 3) return 'warm_lead';
  return 'cold_lead';
}






































