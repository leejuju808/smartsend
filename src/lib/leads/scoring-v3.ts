/**
 * Lead Scoring v3 - ML-powered scoring utilities
 * Pipeline color system based on v3 scores
 */

/**
 * Get pipeline color class based on score_v3
 * 90+ = Red (Superhot)
 * 75-89 = Orange (Hot)
 * 50-74 = Yellow (Warm)
 * 20-49 = Blue (Cool)
 * <20 = Gray (Cold)
 */
export function getScoreV3Color(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "bg-gray-100 border-gray-300 text-gray-600";
  }

  if (score >= 90) {
    return "bg-red-100 border-red-300 text-red-700";
  }
  if (score >= 75) {
    return "bg-orange-100 border-orange-300 text-orange-700";
  }
  if (score >= 50) {
    return "bg-yellow-100 border-yellow-300 text-yellow-700";
  }
  if (score >= 20) {
    return "bg-blue-100 border-blue-300 text-blue-700";
  }
  return "bg-gray-100 border-gray-300 text-gray-600";
}

/**
 * Get pipeline color badge variant
 */
export function getScoreV3BadgeVariant(score: number | null | undefined): "default" | "destructive" | "secondary" | "outline" {
  if (score === null || score === undefined) {
    return "outline";
  }

  if (score >= 90) {
    return "destructive";
  }
  if (score >= 75) {
    return "default";
  }
  if (score >= 50) {
    return "default";
  }
  if (score >= 20) {
    return "secondary";
  }
  return "outline";
}

/**
 * Get score tier label
 */
export function getScoreV3Tier(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "Cold";
  }

  if (score >= 90) {
    return "Superhot";
  }
  if (score >= 75) {
    return "Hot";
  }
  if (score >= 50) {
    return "Warm";
  }
  if (score >= 20) {
    return "Cool";
  }
  return "Cold";
}










