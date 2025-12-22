// =============================================================
// Helper functions for leads list endpoint
// =============================================================

export function toDateOrUndefined(v: string | null) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const STATUSES = new Set(["all", "new", "queued", "sending", "sent", "failed", "replied"]);

export function toStatusOrAll(v: string | null) {
  const s = (v || "all").toLowerCase();
  return STATUSES.has(s) ? (s as any) : "all";
}

