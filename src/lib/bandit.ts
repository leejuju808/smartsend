/**
 * SmartSend Experiments - Bandit Selection with Thompson Sampling
 * 
 * Implements Thompson Sampling for multi-armed bandit optimization
 * to automatically allocate traffic to the best performing variants
 */

export interface VariantPerformance {
  id: string;
  name: string;
  impressions: number;
  opens: number;
  clicks: number;
  replies: number;
  objective: 'open' | 'click' | 'reply';
}

export interface BanditSelection {
  variantId: string;
  variantName: string;
  confidence: number;
  reason: string;
}

/**
 * Calculate the success rate for a given objective
 */
function calculateSuccessRate(variant: VariantPerformance): number {
  if (variant.impressions === 0) return 0;
  
  switch (variant.objective) {
    case 'reply':
      return variant.replies / variant.impressions;
    case 'click':
      return variant.clicks / variant.impressions;
    case 'open':
      return variant.opens / variant.impressions;
    default:
      return 0;
  }
}

/**
 * Calculate Beta distribution parameters for Thompson Sampling
 * Uses Beta(α, β) where α = successes + 1, β = failures + 1
 */
function calculateBetaParams(variant: VariantPerformance): { alpha: number; beta: number } {
  const successRate = calculateSuccessRate(variant);
  const successes = Math.round(successRate * variant.impressions);
  const failures = variant.impressions - successes;
  
  // Add 1 to both parameters for proper Beta distribution (Jeffreys prior)
  return {
    alpha: successes + 1,
    beta: failures + 1
  };
}

/**
 * Sample from Beta distribution using Box-Muller transform approximation
 * This is a simplified version - in production you might want to use a proper math library
 */
function sampleBeta(alpha: number, beta: number): number {
  // Simple approximation for Beta distribution sampling
  // In production, consider using a proper math library like mathjs or similar
  
  // For small sample sizes, add exploration bonus
  const explorationBonus = Math.random() * 0.1;
  
  // Base success rate with some randomness
  const baseRate = alpha / (alpha + beta);
  const randomFactor = (Math.random() - 0.5) * 0.2;
  
  return Math.max(0, Math.min(1, baseRate + randomFactor + explorationBonus));
}

/**
 * Select variant using Thompson Sampling
 * 
 * Thompson Sampling automatically balances exploration vs exploitation:
 * - Exploitation: Favors variants with higher observed success rates
 * - Exploration: Gives chances to variants with fewer impressions
 * 
 * @param variants Array of variant performance data
 * @returns Selected variant with confidence score
 */
export function selectVariantThompson(variants: VariantPerformance[]): BanditSelection {
  if (variants.length === 0) {
    throw new Error('No variants provided for selection');
  }
  
  if (variants.length === 1) {
    return {
      variantId: variants[0].id,
      variantName: variants[0].name,
      confidence: 1.0,
      reason: 'Single variant available'
    };
  }
  
  // Filter out variants with no impressions (cold start)
  const activeVariants = variants.filter(v => v.impressions > 0);
  const coldVariants = variants.filter(v => v.impressions === 0);
  
  // If we have cold variants, give them a chance to warm up
  if (coldVariants.length > 0 && activeVariants.length > 0) {
    const coldStartProbability = 0.2; // 20% chance to explore cold variants
    
    if (Math.random() < coldStartProbability) {
      const selectedCold = coldVariants[Math.floor(Math.random() * coldVariants.length)];
      return {
        variantId: selectedCold.id,
        variantName: selectedCold.name,
        confidence: 0.1,
        reason: 'Cold start exploration'
      };
    }
  }
  
  // If no active variants, randomly select from cold variants
  if (activeVariants.length === 0) {
    const selectedCold = coldVariants[Math.floor(Math.random() * coldVariants.length)];
    return {
      variantId: selectedCold.id,
      variantName: selectedCold.name,
      confidence: 0.05,
      reason: 'Random cold start'
    };
  }
  
  // Thompson Sampling for active variants
  let bestVariant: VariantPerformance | null = null;
  let bestScore = -1;
  let totalScore = 0;
  const scores: Array<{ variant: VariantPerformance; score: number }> = [];
  
  for (const variant of activeVariants) {
    const { alpha, beta } = calculateBetaParams(variant);
    const score = sampleBeta(alpha, beta);
    
    scores.push({ variant, score });
    totalScore += score;
    
    if (score > bestScore) {
      bestScore = score;
      bestVariant = variant;
    }
  }
  
  if (!bestVariant) {
    throw new Error('Failed to select best variant');
  }
  
  // Calculate confidence based on relative performance
  const confidence = bestScore / totalScore;
  
  // Determine reason for selection
  let reason = 'Thompson sampling';
  if (confidence > 0.8) {
    reason = 'Strong performance signal';
  } else if (confidence > 0.6) {
    reason = 'Good performance signal';
  } else if (confidence > 0.4) {
    reason = 'Balanced exploration/exploitation';
  } else {
    reason = 'Exploration phase';
  }
  
  return {
    variantId: bestVariant.id,
    variantName: bestVariant.name,
    confidence,
    reason
  };
}

/**
 * Epsilon-greedy selection as a fallback
 * Useful when you want more predictable exploration
 */
export function selectVariantEpsilonGreedy(
  variants: VariantPerformance[], 
  epsilon: number = 0.1
): BanditSelection {
  if (variants.length === 0) {
    throw new Error('No variants provided for selection');
  }
  
  if (variants.length === 1) {
    return {
      variantId: variants[0].id,
      variantName: variants[0].name,
      confidence: 1.0,
      reason: 'Single variant available'
    };
  }
  
  // Epsilon chance to explore randomly
  if (Math.random() < epsilon) {
    const randomVariant = variants[Math.floor(Math.random() * variants.length)];
    return {
      variantId: randomVariant.id,
      variantName: randomVariant.name,
      confidence: epsilon,
      reason: 'Random exploration'
    };
  }
  
  // Otherwise, exploit the best performing variant
  const bestVariant = variants.reduce((best, current) => {
    const bestRate = calculateSuccessRate(best);
    const currentRate = calculateSuccessRate(current);
    return currentRate > bestRate ? current : best;
  });
  
  return {
    variantId: bestVariant.id,
    variantName: bestVariant.name,
    confidence: 1 - epsilon,
    reason: 'Best performance exploitation'
  };
}

/**
 * Check if a variant should be declared winner automatically
 * Based on statistical significance and performance
 */
export function shouldDeclareWinner(
  variants: VariantPerformance[],
  minImpressions: number = 100,
  confidenceThreshold: number = 0.95
): { shouldDeclare: boolean; winnerId?: string; reason: string } {
  if (variants.length < 2) {
    return { shouldDeclare: false, reason: 'Need at least 2 variants' };
  }
  
  // Check if any variant meets minimum impressions
  const qualifiedVariants = variants.filter(v => v.impressions >= minImpressions);
  
  if (qualifiedVariants.length < 2) {
    return { 
      shouldDeclare: false, 
      reason: `Need at least 2 variants with ${minImpressions}+ impressions` 
    };
  }
  
  // Find the best performing variant
  const bestVariant = qualifiedVariants.reduce((best, current) => {
    const bestRate = calculateSuccessRate(best);
    const currentRate = calculateSuccessRate(current);
    return currentRate > bestRate ? current : best;
  });
  
  const bestRate = calculateSuccessRate(bestVariant);
  
  // Check if best variant is significantly better than others
  let significantlyBetter = true;
  let totalDifference = 0;
  
  for (const variant of qualifiedVariants) {
    if (variant.id === bestVariant.id) continue;
    
    const variantRate = calculateSuccessRate(variant);
    const difference = bestRate - variantRate;
    totalDifference += difference;
    
    // Simple significance check - could be improved with proper statistical tests
    if (difference < 0.05) { // 5% difference threshold
      significantlyBetter = false;
      break;
    }
  }
  
  if (significantlyBetter && totalDifference / (qualifiedVariants.length - 1) > 0.1) {
    return {
      shouldDeclare: true,
      winnerId: bestVariant.id,
      reason: `Significantly better performance (${(bestRate * 100).toFixed(1)}% vs ${(totalDifference / (qualifiedVariants.length - 1) * 100).toFixed(1)}% average)`
    };
  }
  
  return {
    shouldDeclare: false,
    reason: 'No statistically significant winner yet'
  };
}

/**
 * Get variant selection strategy based on campaign stage
 */
export function getSelectionStrategy(
  totalImpressions: number,
  minImpressions: number = 100
): 'thompson' | 'epsilon_greedy' | 'exploit' {
  if (totalImpressions < minImpressions / 2) {
    return 'epsilon_greedy'; // More exploration early on
  } else if (totalImpressions < minImpressions) {
    return 'thompson'; // Balanced exploration/exploitation
  } else {
    return 'exploit'; // Focus on best performers
  }
} 