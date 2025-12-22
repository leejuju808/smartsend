import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { NotificationsTable } from "./_components/notifications-table";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = createClient();

  const { data: notifications } = await supabase
    .from("lead_notifications")
    .select(
      `
      id,
      campaign_lead_id,
      campaign_id,
      lead_id,
      type,
      channel,
      status,
      error,
      sent_at,
      seen_at,
      created_at,
      payload,
      lead:leads (
        name,
        email
      ),
      campaign:campaigns (
        name
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows =
    notifications?.map((n: any) => ({
      id: n.id as string,
      type: n.type as string,
      channel: n.channel as string,
      status: n.status as string,
      error: n.error as string | null,
      sent_at: n.sent_at as string | null,
      seen_at: n.seen_at as string | null,
      created_at: n.created_at as string,
      campaign_id: n.campaign_id as string,
      campaign_name: n.campaign?.name ?? "Unknown campaign",
      lead_id: n.lead_id as string,
      lead_name: n.lead?.name ?? null,
      lead_email: n.lead?.email ?? "",
      payload: n.payload as Record<string, any> | null,
      campaign_lead_id: n.campaign_lead_id as string,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Notifications
        </h1>
        <p className="text-sm text-muted-foreground">
          Hot lead alerts and system notifications triggered by reply intent.
        </p>
      </div>
      <NotificationsTable rows={rows} />
    </div>
  );
}































































