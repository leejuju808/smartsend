export type Tone = "formal" | "casual" | "humorous" | "assertive";

type Perf = {
  tone: Tone;
  sends: number;
  open_rate: number;
  positive_share: number;
  meeting_share: number;
};

function score(p: Perf) {
  const or = Number.isFinite(p.open_rate) ? p.open_rate : 0;
  const pr = Number.isFinite(p.positive_share) ? p.positive_share : 0;
  const mr = Number.isFinite(p.meeting_share) ? p.meeting_share : 0;
  return 0.2 * or + 0.6 * pr + 0.2 * mr;
}

export function pickToneSegment(
  perf: Perf[],
  opts?: { epsilon?: number; minSamples?: number; disabledTones?: Set<string> }
): Tone {
  const eps = opts?.epsilon ?? 0.12; // slightly less explore when segmented
  const minS = opts?.minSamples ?? 12; // ensure baseline per tone in the segment
  const disabled = opts?.disabledTones ?? new Set<string>();

  const tones: Tone[] = ["formal", "casual", "humorous", "assertive"].filter(
    (t) => !disabled.has(t)
  ) as Tone[];

  if (tones.length === 0) return "formal"; // fallback if all disabled

  for (const t of tones) {
    const p = perf.find((x) => x.tone === t);
    if (!p || (p.sends ?? 0) < minS) return t; // round-robin cold start
  }
  if (Math.random() < eps)
    return tones[Math.floor(Math.random() * tones.length)];
  return (
    [...perf].sort((a, b) => score(b) - score(a))[0]?.tone ?? "formal"
  );
}

