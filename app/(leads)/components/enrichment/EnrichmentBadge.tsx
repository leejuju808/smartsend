import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type EnrichmentState = "fresh" | "stale" | "queued" | "running" | "missing";

const STATE_LABEL: Record<EnrichmentState, string> = {
  fresh: "Fresh",
  stale: "Stale",
  queued: "Queued",
  running: "Running",
  missing: "Missing",
};

const STATE_STYLE: Record<EnrichmentState, string> = {
  fresh: "bg-emerald-100 text-emerald-700 border-emerald-200",
  stale: "bg-amber-100 text-amber-800 border-amber-200",
  queued: "bg-sky-100 text-sky-800 border-sky-200",
  running: "bg-blue-100 text-blue-800 border-blue-200",
  missing: "bg-slate-100 text-slate-600 border-slate-200",
};

export function getEnrichmentState(details: {
  job?: { status: string | null } | null;
  enrichment?: { is_stale: boolean | null } | null;
}): EnrichmentState {
  if (details.job?.status === "running") return "running";
  if (details.job?.status === "queued") return "queued";
  if (!details.enrichment) return "missing";
  if (details.enrichment.is_stale) return "stale";
  return "fresh";
}

export function EnrichmentBadge({
  state,
  loading,
  title,
}: {
  state: EnrichmentState;
  loading?: boolean;
  title?: string;
}) {
  if (loading) {
    return <Skeleton className="h-5 w-16 rounded-full" />;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        STATE_STYLE[state]
      )}
      title={title}
    >
      {STATE_LABEL[state]}
      {state === "running" && (
        <span className="ml-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
    </span>
  );
}



