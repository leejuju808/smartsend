import { createClient } from "@/lib/supabase/server";

type TimelineItem = {
  created_at: string;
  kind: string;
  meta: any;
  actor_id: string | null;
  source: string;
  thread_id: string;
};

export async function Timeline({ threadId }: { threadId: string }) {
  const supabase = createClient();
  const { data: items, error } = await supabase
    .from("v_thread_timeline")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !items?.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Timeline</h2>
      <div className="divide-y rounded-lg border">
        {items.map((item: TimelineItem, index: number) => (
          <div key={`${item.created_at}-${index}`} className="flex items-start gap-3 px-3 py-2 text-sm">
            <div className="min-w-[140px] text-xs text-muted-foreground">
              {formatDate(item.created_at)}
            </div>
            <div className="flex-1">
              <strong className="mr-2">{label(item.kind)}</strong>
              <span className="text-muted-foreground">{metaText(item.kind, item.meta)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function label(kind: string) {
  switch (kind) {
    case "detect_intent":
      return "Detection";
    case "snooze":
      return "Snoozed";
    case "unpause":
      return "Unpaused";
    case "auto_resume":
      return "Auto-Resumed";
    case "mute":
      return "Muted";
    case "unmute":
      return "Unmuted";
    default:
      return kind;
  }
}

function metaText(kind: string, meta: any) {
  try {
    if (!meta) return "";
    const data = typeof meta === "string" ? JSON.parse(meta) : meta;
    if (kind === "detect_intent") {
      const parts: string[] = [];
      if (data.intent) parts.push(data.intent);
      if (data.subtype) parts.push(data.subtype);
      if (typeof data.confidence === "number") {
        parts.push(`conf ${Math.round(data.confidence * 100)}%`);
      }
      return parts.join(" · ");
    }
    if (kind === "snooze") {
      const resumeAt = data.resume_at ? formatDate(data.resume_at) : null;
      return `for ${data.days}d${resumeAt ? ` → resumes ${resumeAt}` : ""}`;
    }
    return "";
  } catch {
    return "";
  }
}





