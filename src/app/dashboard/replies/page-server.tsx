import { createClient } from "@supabase/supabase-js";
import ReplyRow from "./_components/ReplyRow";

// Server-side Supabase client for server components
function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export default async function RepliesPageServer() {
  const supabase = getSupabaseServer();

  // Query emails with reply status, ordered by last reply time
  const { data: rows, error } = await supabase
    .from("emails")
    .select("id, lead_name, subject, has_replied, last_reply_at")
    .order("last_reply_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    console.error("Error fetching replies:", error);
    return (
      <div className="p-6">
        <p className="text-red-600">Error loading replies: {error.message}</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="p-6">
        <p className="text-gray-500">No replies yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-6">
      <h1 className="text-2xl font-bold mb-4">Replies Inbox</h1>
      {rows.map((email) => (
        <ReplyRow
          key={email.id}
          leadName={email.lead_name || "Lead"}
          subject={email.subject || "(no subject)"}
          hasReplied={email.has_replied || false}
          lastReplyAt={email.last_reply_at}
        />
      ))}
    </div>
  );
}

