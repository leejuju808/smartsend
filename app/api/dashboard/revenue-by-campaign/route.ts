import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace_id
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!workspaceMember?.workspace_id) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const workspaceId = workspaceMember.workspace_id;

  // Get revenue by campaign for this workspace
  const { data: contacts } = await supabase
    .from("contacts")
    .select("source_campaign_id, lead_status, est_job_value, actual_job_value")
    .eq("workspace_id", workspaceId)
    .not("source_campaign_id", "is", null);

  if (!contacts?.length) {
    return NextResponse.json([]);
  }

  // Group by campaign_id
  const campaignMap = new Map<string, {
    campaign_id: string;
    total_contacts: number;
    hot_leads: number;
    won_leads: number;
    pipeline_estimate: number;
    won_revenue: number;
  }>();

  contacts.forEach((contact) => {
    if (!contact.source_campaign_id) return;

    const existing = campaignMap.get(contact.source_campaign_id) || {
      campaign_id: contact.source_campaign_id,
      total_contacts: 0,
      hot_leads: 0,
      won_leads: 0,
      pipeline_estimate: 0,
      won_revenue: 0,
    };

    existing.total_contacts++;
    if (contact.lead_status === "hot") existing.hot_leads++;
    if (contact.lead_status === "won") existing.won_leads++;
    if (contact.est_job_value) existing.pipeline_estimate += Number(contact.est_job_value);
    if (contact.actual_job_value) existing.won_revenue += Number(contact.actual_job_value);

    campaignMap.set(contact.source_campaign_id, existing);
  });

  const rows = Array.from(campaignMap.values());
  const campaignIds = rows.map((r) => r.campaign_id);

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .in("id", campaignIds);

  const nameById: Record<string, string> = {};
  (campaigns || []).forEach((c: any) => {
    nameById[c.id] = c.name;
  });

  const mapped = rows.map((r: any) => ({
    ...r,
    campaign_name: nameById[r.campaign_id] || "Unknown campaign",
  }));

  return NextResponse.json(mapped);
}

