"use client";

type ProvenanceRecord = {
  source?: string | null;
  rank?: number | null;
  at?: string | null;
};

type EnrichedFrom = Record<string, ProvenanceRecord | undefined> | null | undefined;

export function FieldProvenance({ enrichedFrom, field }: { enrichedFrom?: EnrichedFrom; field: string }) {
  const meta = enrichedFrom?.[field];
  if (!meta?.source) return null;

  let dateLabel: string | null = null;
  if (meta.at) {
    try {
      dateLabel = new Date(meta.at).toLocaleDateString();
    } catch {
      dateLabel = meta.at;
    }
  }

  return (
    <span className="text-xs text-muted-foreground">
      from {meta.source}
      {typeof meta.rank === "number" ? ` · r${meta.rank}` : ""}
      {dateLabel ? ` · ${dateLabel}` : ""}
    </span>
  );
}



