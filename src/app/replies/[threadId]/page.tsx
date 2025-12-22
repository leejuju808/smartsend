import { getServerSupabase } from "@/lib/supabase/server";
import { ReplyComposer } from "@/components/replies/ReplyComposer";

export default async function ThreadPage({ params }: { params: { threadId: string } }) {
  const supabase = getServerSupabase();

  const { data: thread, error } = await supabase
    .from("emails")
    .select("*")
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading thread:", error);
    return <div className="p-6 text-red-400">Error loading thread: {error.message}</div>;
  }

  if (!thread?.length) {
    return <div className="p-6 text-gray-400">No messages found.</div>;
  }

  // Get the first message's "from" (or use lead_name if available)
  const firstMessage = thread[0];
  const toEmail = firstMessage.to || firstMessage.lead_name || "";

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-2">
        {thread.map((msg) => (
          <div key={msg.id} className="border-b pb-3">
            <p className="text-sm font-semibold">{msg.from || msg.lead_name || "Unknown"}</p>
            <p className="text-sm">{msg.body || msg.body_text || msg.body_html || ""}</p>
          </div>
        ))}
      </div>

      <ReplyComposer threadId={params.threadId} to={toEmail} />
    </div>
  );
}
