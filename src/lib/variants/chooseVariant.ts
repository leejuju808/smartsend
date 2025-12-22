/**
 * Choose a variant based on weight distribution (v2: respects is_winner and is_archived)
 * @param variants Array of variants with weight, is_winner?, is_archived? properties
 * @param winnerOnly If true and a winner exists, only return winner (v2.1 feature)
 * @returns Selected variant or null if no variants
 */
export function chooseVariant<T extends { 
  weight: number; 
  id: string; 
  is_winner?: boolean;
  is_archived?: boolean;
}>(
  variants: T[],
  winnerOnly: boolean = false
): T | null {
  if (!variants || variants.length === 0) {
    return null;
  }

  // Filter out archived variants
  const active = variants.filter(v => !v.is_archived);

  if (active.length === 0) {
    return null;
  }

  // If winnerOnly mode and there's a hard winner, short-circuit
  if (winnerOnly) {
    const winner = active.find(v => v.is_winner === true);
    if (winner) {
      return winner;
    }
  }

  // Calculate total weight of active variants
  const totalWeight = active.reduce((sum, v) => sum + (v.weight || 0), 0) || 1;

  // Generate random number between 0 and totalWeight
  let r = Math.random() * totalWeight;

  // Find which variant this random number falls into
  for (const v of active) {
    r -= v.weight || 0;
    if (r <= 0) {
      return v;
    }
  }

  // Fallback to last active variant (shouldn't happen, but safety)
  return active[active.length - 1];
}



