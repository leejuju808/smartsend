type Variant = { id: string; weight: number; subject: string; body_html: string };

/**
 * Build a round-robin wheel from variants based on their weights
 * e.g., [{w:50}, {w:30}, {w:20}] -> expands to array representing distribution
 */
export function buildRoundRobin(variants: Variant[]) {
  // If no variants, return empty array (caller should handle)
  if (!variants?.length) return [];
  
  // Normalize weights to sum to 100
  const total = variants.reduce((sum, v) => sum + (v.weight || 0), 0) || 100;
  
  // Create weighted slots (each unit = ~5% representation)
  // This gives us 20 slots per 100% weight
  const slots = variants.flatMap(v => {
    const slotsForVariant = Math.max(1, Math.round((v.weight / total) * 20));
    return Array.from({ length: slotsForVariant }, () => v);
  });
  
  return slots.length ? slots : variants; // fallback to one of each if math goes wrong
}

/**
 * Get next variant from wheel in round-robin fashion
 */
export function pickVariant(wheel: Variant[], index: number): Variant {
  if (wheel.length === 0) {
    throw new Error("Variant wheel is empty");
  }
  return wheel[index % wheel.length];
}