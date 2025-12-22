import QueueTable from "@/components/send-queue/QueueTable";
import { supabaseAdmin } from "@/server/supabase";

export const dynamic = "force-dynamic";

export default async function SendQueuePage() {
  const { data, error } = await supabaseAdmin
    .from("send_queue")
    .select(`
      id, lead_id, campaign_id, status, attempt, max_attempts, scheduled_at, last_error,
      leads:lead_id ( email ),
      campaigns:campaign_id ( name )
    `)
    .order("scheduled_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Error fetching send_queue:", error);
  }

  const rows = (data || []).map((r: any) => ({
    id: r.id,
    lead_email: r.leads?.email ?? "",
    campaign_name: r.campaigns?.name ?? "",
    status: r.status,
    attempt: r.attempt,
    max_attempts: r.max_attempts,
    scheduled_at: r.scheduled_at,
    last_error: r.last_error,
  }));

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Send Queue</h1>
      <QueueTable rows={rows} />
    </div>
  );
}
