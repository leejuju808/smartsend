/**
 * Risk Calculator
 * Calculates spam risk scores and generates recommendations
 */

export interface VolumeStats {
  last_24h: number;
  last_7d: number;
  last_30d: number;
}

export interface DNSStatus {
  has_spf: boolean;
  has_dkim: boolean;
  has_dmarc: boolean;
}

export interface ContentRisk {
  links: number;
  images: number;
  spammy_terms: string[];
  all_caps_subject: boolean;
  exclamation_count: number;
}

export interface RiskReason {
  code: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  penalty: number;
}

export interface WarmupCheckResult {
  score: number;
  risk_level: 'low' | 'medium' | 'high';
  reasons: RiskReason[];
  recommendations: Recommendation[];
  suggested_daily_limit: number;
  dns_status: DNSStatus;
  volume_stats: VolumeStats;
  checked_at: string;
}

export interface Recommendation {
  code: string;
  label: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  link?: string;
  warmup_schedule?: {
    day_1_2: number;
    day_3_4: number;
    day_5_7: number;
    day_8_14: number;
    day_15_plus: number;
  };
}

/**
 * Analyze content for spam risk indicators
 */
export function analyzeContentRisk(
  subject: string,
  bodyHtml?: string,
  bodyText?: string
): ContentRisk {
  const bodyContent = bodyHtml || bodyText || '';
  
  // Count links (basic regex)
  const linkMatches = bodyContent.match(/<a[^>]*href/gi);
  const links = linkMatches ? linkMatches.length : 0;
  
  // Count images
  const imageMatches = bodyContent.match(/<img/gi);
  const images = imageMatches ? imageMatches.length : 0;
  
  // Check for ALL CAPS in subject (excluding short subjects)
  const allCapsSubject = subject.length > 5 && 
    subject === subject.toUpperCase() && 
    /[A-Z]/.test(subject);
  
  // Count exclamation marks
  const exclamationCount = (subject.match(/!/g) || []).length;
  
  // Check for spammy terms
  const spammyPatterns = [
    'free', 'earn', 'guaranteed', 'win money', 'act now', 'limited time',
    'click here', 'buy now', 'no credit check', 'make money', 'work from home',
    '$$$', '!!!', 'urgent', 'asap', 'congratulations', 'winner'
  ];
  
  const combinedText = `${subject} ${bodyContent}`.toLowerCase();
  const spammyTerms = spammyPatterns.filter(pattern => 
    combinedText.includes(pattern.toLowerCase())
  );
  
  return {
    links,
    images,
    spammy_terms: spammyTerms,
    all_caps_subject: allCapsSubject,
    exclamation_count: exclamationCount,
  };
}

/**
 * Calculate risk score based on DNS, volume, and content
 */
export function calculateRiskScore(
  dnsStatus: DNSStatus,
  volumeStats: VolumeStats,
  contentRisk: ContentRisk,
  domainAgeDays?: number,
  isNewDomain: boolean = false
): { score: number; risk_level: 'low' | 'medium' | 'high'; reasons: RiskReason[] } {
  let score = 80; // Base score
  const reasons: RiskReason[] = [];
  
  // DNS penalties
  if (!dnsStatus.has_spf) {
    score -= 15;
    reasons.push({
      code: 'missing_spf',
      label: 'SPF record missing',
      severity: 'high',
      penalty: 15,
    });
  }
  
  if (!dnsStatus.has_dkim) {
    score -= 20;
    reasons.push({
      code: 'missing_dkim',
      label: 'DKIM record missing',
      severity: 'high',
      penalty: 20,
    });
  }
  
  if (!dnsStatus.has_dmarc) {
    score -= 10;
    reasons.push({
      code: 'missing_dmarc',
      label: 'DMARC record missing',
      severity: 'medium',
      penalty: 10,
    });
  }
  
  // Volume penalties
  if (isNewDomain || (domainAgeDays !== undefined && domainAgeDays < 30)) {
    if (volumeStats.last_24h > 200) {
      score -= 15;
      reasons.push({
        code: 'high_volume_new_domain',
        label: `Sending ${volumeStats.last_24h} emails/day from a new domain (<30 days)`,
        severity: 'high',
        penalty: 15,
      });
    }
  }
  
  // Volume jump penalty
  if (volumeStats.last_7d > 0 && volumeStats.last_30d > volumeStats.last_7d) {
    const previousPeriod = volumeStats.last_30d - volumeStats.last_7d;
    if (previousPeriod > 0 && volumeStats.last_7d / previousPeriod > 1.5) {
      score -= 10;
      reasons.push({
        code: 'volume_jump',
        label: 'Sending volume increased significantly vs previous period',
        severity: 'medium',
        penalty: 10,
      });
    }
  }
  
  // Content penalties
  if (contentRisk.links > 3) {
    score -= 5;
    reasons.push({
      code: 'too_many_links',
      label: `Email contains ${contentRisk.links} links (recommended: ≤3)`,
      severity: 'low',
      penalty: 5,
    });
  }
  
  if (contentRisk.all_caps_subject) {
    score -= 10;
    reasons.push({
      code: 'all_caps_subject',
      label: 'Subject line is ALL CAPS',
      severity: 'medium',
      penalty: 10,
    });
  }
  
  if (contentRisk.spammy_terms.length > 0) {
    const penalty = Math.min(15, contentRisk.spammy_terms.length * 5);
    score -= penalty;
    reasons.push({
      code: 'spammy_terms',
      label: `Subject/body contains spammy terms: ${contentRisk.spammy_terms.join(', ')}`,
      severity: 'medium',
      penalty,
    });
  }
  
  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  // Determine risk level
  const risk_level: 'low' | 'medium' | 'high' = 
    score < 40 ? 'high' : score < 70 ? 'medium' : 'low';
  
  return { score, risk_level, reasons };
}

/**
 * Generate recommendations based on risk reasons
 */
export function getRecommendations(reasons: RiskReason[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  for (const reason of reasons) {
    switch (reason.code) {
      case 'missing_spf':
        recommendations.push({
          code: 'add_spf',
          label: 'Add SPF record to your DNS',
          description: 'SPF (Sender Policy Framework) helps prevent email spoofing. Add a TXT record to your domain DNS.',
          priority: 'high',
          link: 'https://docs.smartsend.ai/dns/spf-setup',
        });
        break;
      case 'missing_dkim':
        recommendations.push({
          code: 'add_dkim',
          label: 'Add DKIM record to your DNS',
          description: 'DKIM (DomainKeys Identified Mail) adds cryptographic signatures to your emails for better deliverability.',
          priority: 'high',
          link: 'https://docs.smartsend.ai/dns/dkim-setup',
        });
        break;
      case 'missing_dmarc':
        recommendations.push({
          code: 'add_dmarc',
          label: 'Add DMARC record to your DNS',
          description: 'DMARC (Domain-based Message Authentication) provides additional email authentication and reporting.',
          priority: 'medium',
          link: 'https://docs.smartsend.ai/dns/dmarc-setup',
        });
        break;
      case 'high_volume_new_domain':
        recommendations.push({
          code: 'lower_send_volume',
          label: 'Reduce daily send volume for new domain',
          description: 'New domains need gradual warmup. Start with 30-50 emails/day, then gradually increase.',
          priority: 'high',
          warmup_schedule: {
            day_1_2: 30,
            day_3_4: 60,
            day_5_7: 100,
            day_8_14: 200,
            day_15_plus: 500,
          },
        });
        break;
      case 'volume_jump':
        recommendations.push({
          code: 'gradual_increase',
          label: 'Gradually increase sending volume',
          description: 'Avoid sudden spikes in volume. Increase by no more than 20% per day.',
          priority: 'medium',
        });
        break;
      case 'too_many_links':
        recommendations.push({
          code: 'reduce_links',
          label: 'Reduce number of links in email',
          description: 'Emails with too many links can trigger spam filters. Keep it to 1-3 links maximum.',
          priority: 'low',
        });
        break;
      case 'all_caps_subject':
        recommendations.push({
          code: 'fix_subject_caps',
          label: 'Avoid ALL CAPS in subject line',
          description: 'Use normal capitalization. Example: "Quick question about your roof in {{city}}" instead of "QUICK QUESTION!!!"',
          priority: 'medium',
        });
        break;
      case 'spammy_terms':
        recommendations.push({
          code: 'avoid_spammy_terms',
          label: 'Remove spammy words from subject/body',
          description: 'Avoid words like "free", "guaranteed", "act now", "$$$", etc. Use natural, conversational language.',
          priority: 'medium',
        });
        break;
    }
  }
  
  return recommendations;
}





























































