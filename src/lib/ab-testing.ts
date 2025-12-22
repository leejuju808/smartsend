// lib/ab-testing.ts
// Statistical significance helper for A/B testing

export interface ABTestResult {
  variant: string;
  sent: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
}

export interface SignificanceResult {
  isSignificant: boolean;
  confidence: number;
  winner?: string;
  pValue: number;
  recommendation: string;
}

/**
 * Calculate statistical significance between two proportions using two-proportion z-test
 * @param n1 - Sample size for variant 1
 * @param x1 - Success count for variant 1
 * @param n2 - Sample size for variant 2  
 * @param x2 - Success count for variant 2
 * @param alpha - Significance level (default 0.05)
 */
export function calculateSignificance(
  n1: number, x1: number, 
  n2: number, x2: number, 
  alpha: number = 0.05
): SignificanceResult {
  if (n1 === 0 || n2 === 0) {
    return {
      isSignificant: false,
      confidence: 0,
      pValue: 1,
      recommendation: "Insufficient data for statistical analysis"
    };
  }

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  
  // Pooled proportion
  const pPooled = (x1 + x2) / (n1 + n2);
  
  // Standard error
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1/n1 + 1/n2));
  
  if (se === 0) {
    return {
      isSignificant: false,
      confidence: 0,
      pValue: 1,
      recommendation: "No variance in data"
    };
  }
  
  // Z-score
  const z = Math.abs(p1 - p2) / se;
  
  // P-value approximation (two-tailed)
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  
  // Confidence level
  const confidence = (1 - pValue) * 100;
  
  const isSignificant = pValue < alpha;
  const winner = p1 > p2 ? "A" : "B";
  
  let recommendation = "";
  if (!isSignificant) {
    if (n1 + n2 < 1000) {
      recommendation = "Collect more data (need at least 1000 total samples)";
    } else {
      recommendation = "No significant difference detected";
    }
  } else {
    recommendation = `Variant ${winner} is significantly better (${confidence.toFixed(1)}% confidence)`;
  }
  
  return {
    isSignificant,
    confidence,
    winner,
    pValue,
    recommendation
  };
}

/**
 * Analyze A/B test results for multiple variants
 */
export function analyzeABTest(results: ABTestResult[]): {
  comparisons: Array<{
    variantA: string;
    variantB: string;
    significance: SignificanceResult;
  }>;
  overallWinner?: string;
  overallRecommendation: string;
} {
  if (results.length < 2) {
    return {
      comparisons: [],
      overallRecommendation: "Need at least 2 variants to compare"
    };
  }
  
  const comparisons: Array<{
    variantA: string;
    variantB: string;
    significance: SignificanceResult;
  }> = [];
  
  // Compare each pair of variants
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const variantA = results[i];
      const variantB = results[j];
      
      const significance = calculateSignificance(
        variantA.sent, variantA.opens,
        variantB.sent, variantB.opens
      );
      
      comparisons.push({
        variantA: variantA.variant,
        variantB: variantB.variant,
        significance
      });
    }
  }
  
  // Find overall winner (highest open rate with sufficient sample size)
  const validResults = results.filter(r => r.sent >= 100);
  if (validResults.length > 0) {
    const winner = validResults.reduce((best, current) => 
      current.openRate > best.openRate ? current : best
    );
    
    return {
      comparisons,
      overallWinner: winner.variant,
      overallRecommendation: `Variant ${winner.variant} has the highest open rate (${winner.openRate.toFixed(1)}%)`
    };
  }
  
  return {
    comparisons,
    overallRecommendation: "Need more data to determine winner"
  };
}

/**
 * Approximate cumulative distribution function for standard normal distribution
 * Using Abramowitz and Stegun approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x) / Math.sqrt(2.0);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate required sample size for A/B test
 * @param baselineRate - Expected conversion rate for control group
 * @param minimumDetectableEffect - Minimum effect size to detect (as decimal)
 * @param power - Statistical power (default 0.8)
 * @param alpha - Significance level (default 0.05)
 */
export function calculateRequiredSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  power: number = 0.8,
  alpha: number = 0.05
): number {
  const zAlpha = Math.abs(normalCDF(1 - alpha/2));
  const zBeta = Math.abs(normalCDF(power));
  
  const p1 = baselineRate;
  const p2 = baselineRate + minimumDetectableEffect;
  const pPooled = (p1 + p2) / 2;
  
  const numerator = Math.pow(zAlpha * Math.sqrt(2 * pPooled * (1 - pPooled)) + 
                           zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2);
  const denominator = Math.pow(p2 - p1, 2);
  
  return Math.ceil(numerator / denominator);
}