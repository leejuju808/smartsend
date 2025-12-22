import { createClient } from "@/lib/supabase/server";

type ThreadDraftRecord = {
  subject: string;
  body: string;
  updated_at: string;
};

export async function ReplyDraft({ threadId }: { threadId: string }) {
  const supabase = createClient();
  const { data: draft } = await supabase
    .from("thread_drafts")
    .select("subject, body, updated_at")
    .eq("thread_id", threadId)
    .maybeSingle<ThreadDraftRecord>();

  if (!draft) return null;

  return (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Draft Reply</h3>
        <span className="text-xs text-muted-foreground">Updated {new Date(draft.updated_at).toLocaleString()}</span>
      </div>
      <input className="w-full h-9 border rounded px-2 text-sm" defaultValue={draft.subject} readOnly />
      <textarea className="w-full h-40 border rounded p-2 text-sm" defaultValue={draft.body} readOnly />
    </div>
  );
}




