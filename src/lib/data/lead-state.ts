export type LeadState = "queued" | "sending" | "sent" | "replied" | "failed" | "canceled" | "bounced" | "complaint" | "idle";

export function deriveLeadState(events: Array<{ type: string; at: string; status?: string; fail_code?: string; canceled_at?: string }>): LeadState {
  if (!events?.length) return "idle";

  const last = [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).at(-1)!;

  // terminal hard negatives first
  if (last.type === "complaint") return "complaint";
  if (last.type === "bounce") return "bounced";
  if (last.type === "reply_detected") return "replied";

  // queue state transitions
  if (last.type === "queue") {
    if (last.status === "failed") return "failed";
    if (last.status === "queued") return "queued";
    if (last.status === "sending") return "sending";
    if (last.status === "canceled" || last.canceled_at) return "canceled";
  }

  // success path
  if (last.type === "sent") return "sent";

  return "idle";
}

export function stateBadgeClasses(state: LeadState) {
  const base = "px-2 py-0.5 rounded-full text-xs border";
  switch (state) {
    case "replied":
      return `${base} border-green-600 text-green-700`;
    case "sent":
      return `${base} border-emerald-600 text-emerald-700`;
    case "queued":
      return `${base} border-sky-600 text-sky-700`;
    case "sending":
      return `${base} border-blue-600 text-blue-700`;
    case "failed":
      return `${base} border-red-600 text-red-700`;
    case "bounced":
      return `${base} border-red-600 text-red-700`;
    case "complaint":
      return `${base} border-red-700 text-red-800`;
    case "canceled":
      return `${base} border-zinc-400 text-zinc-600`;
    default:
      return `${base} border-zinc-300 text-zinc-600`;
  }
}

