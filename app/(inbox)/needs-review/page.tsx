import { createServerClient } from "@/lib/supabase/server";
import { ReclassifyDropdown } from "../thread/[id]/ReclassifyDropdown";
import { ResolveButton } from "./ResolveButton";
import { ForceStrongButton } from "./ForceStrongButton";

type ReviewRow = {
  thread_id: string;
  created_at: string;
  reason: string;
  note: string | null;
  inbox_threads: {
    subject: string | null;
    ai_intent: string | null;
    ai_confidence: number | null;
  };
};

export default async function NeedsReviewPage() {
  const supabase = createServerClient();
  const { data: rows } = await supabase
    .from("reply_review_queue")
    .select(
      "thread_id, created_at, reason, note, inbox_threads!inner(subject, ai_intent, ai_confidence)",
    )
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  const items = rows ?? [];

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-semibold">Needs Review</h1>
      <div className="grid gap-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-zinc-500">
            Nothing in the queue. 🎉
          </div>
        ) : (
          items.map((r: ReviewRow) => (
            <div
              key={r.thread_id}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div>
                <div className="text-sm font-medium line-clamp-1">
                  {r.inbox_threads.subject ?? "(no subject)"}
                </div>
                <div className="text-xs text-zinc-500">
                  AI: {r.inbox_threads.ai_intent ?? "unknown"} • conf{" "}
                  {typeof r.inbox_threads.ai_confidence === "number"
                    ? r.inbox_threads.ai_confidence.toFixed(2)
                    : "—"}{" "}
                  • reason {r.reason}
                  {r.note ? ` • note: ${r.note}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ReclassifyDropdown
                  threadId={r.thread_id}
                  current={r.inbox_threads.ai_intent}
                />
                <ForceStrongButton threadId={r.thread_id} />
                <ResolveButton threadId={r.thread_id} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}





