// simple djb2 hash for stable buckets
export function bucketSeed(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return Math.abs(hash) % 10000; // 0..9999
}

export function assignArm({
  campaignId,
  contactId,
  stepNumber,
  rampPercent,
}: {
  campaignId: string;
  contactId: string;
  stepNumber: number;
  rampPercent: number;
}): "control" | "treatment" {
  const seed = `${campaignId}:${contactId}:${stepNumber}`;
  const b = bucketSeed(seed); // 0..9999
  const cutoff = Math.round((rampPercent / 100) * 10000);
  return b < cutoff ? "treatment" : "control";
}















