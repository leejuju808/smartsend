export type Tone = "formal" | "casual" | "humorous" | "assertive";

const ALL: Tone[] = ["formal", "casual", "humorous", "assertive"];

export type Perf = {
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

export function pickTone(
  perf: Perf[],
  opts?: { epsilon?: number; minSamplesPerTone?: number }
): Tone {
  const epsilon = opts?.epsilon ?? 0.15;
  const minS = opts?.minSamplesPerTone ?? 20;

  for (const t of ALL) {
    const p = perf.find((x) => x.tone === t);
    if (!p || (p.sends ?? 0) < minS) {
      return t;
    }
  }

  if (Math.random() < epsilon) {
    return ALL[Math.floor(Math.random() * ALL.length)];
  }

  const best = [...perf].sort((a, b) => score(b) - score(a))[0];
  return best?.tone ?? "formal";
}
















