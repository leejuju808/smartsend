import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase";
import { getCurrentWorkspaceId } from "@/lib/workspace";

type ExportSettings = {
  export_contacts?: boolean;
  export_tasks?: boolean;
  export_pipeline?: boolean;
  export_quotes?: boolean;
  export_appointments?: boolean;
  export_activity_logs?: boolean;
  export_revenue_data?: boolean;
};

async function getWorkspaceRole(supabase: any, workspaceId: string, userId: string) {
  // Some parts of the app use `workspace_members`, others use `workspace_memberships`.
  // We accept either here so export remains reliable across schema versions.
  const { data: m1 } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (m1?.role) return m1.role as string;

  const { data: m2 } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (m2?.role) return m2.role as string;

  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (ws?.owner_id && ws.owner_id === userId) return "owner";
  return null;
}

async function safeSelect<T = any>(q: Promise<{ data: T | null; error: any }>) {
  try {
    const { data, error } = await q;
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e };
  }
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspace_id = await getCurrentWorkspaceId();
  if (!workspace_id) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const role = await getWorkspaceRole(supabase, workspace_id, user.id);
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Only Owners/Admins can export workspace data" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "5000"), 100), 20000);

  // Load export settings (defaults to true)
  const { data: exportSettingsRow } = await supabase
    .from("data_export_settings")
    .select("*")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  const settings: Required<ExportSettings> = {
    export_contacts: exportSettingsRow?.export_contacts !== false,
    export_tasks: exportSettingsRow?.export_tasks !== false,
    export_pipeline: exportSettingsRow?.export_pipeline !== false,
    export_quotes: exportSettingsRow?.export_quotes !== false,
    export_appointments: exportSettingsRow?.export_appointments !== false,
    export_activity_logs: exportSettingsRow?.export_activity_logs !== false,
    export_revenue_data: exportSettingsRow?.export_revenue_data !== false,
  };

  const warnings: string[] = [];

  // Core workspace snapshot
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspace_id)
    .maybeSingle();

  const { data: workspace_members } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspace_id)
    .limit(5000);

  // Campaigns (backbone relationship key)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("workspace_id", workspace_id)
    .limit(limit);

  const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);
  if ((campaigns?.length ?? 0) >= limit) warnings.push(`campaigns truncated at ${limit}`);

  // Contacts + Leads
  const contacts = settings.export_contacts
    ? (await safeSelect(
        supabase.from("contacts").select("*").eq("workspace_id", workspace_id).limit(limit)
      )).data
    : null;
  if ((contacts as any[])?.length >= limit) warnings.push(`contacts truncated at ${limit}`);

  const leads = settings.export_pipeline
    ? (await safeSelect(
        supabase.from("leads").select("*").eq("workspace_id", workspace_id).limit(limit)
      )).data
    : null;
  if ((leads as any[])?.length >= limit) warnings.push(`leads truncated at ${limit}`);

  // Long-term memory (timeline + activity log)
  const timeline_events = settings.export_activity_logs
    ? (await safeSelect(
        supabase.from("timeline_events").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(limit)
      )).data
    : null;
  if ((timeline_events as any[])?.length >= limit) warnings.push(`timeline_events truncated at ${limit}`);

  const activity_logs_v2 = settings.export_activity_logs
    ? (await safeSelect(
        supabase.from("activity_logs_v2").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(limit)
      )).data
    : null;
  if ((activity_logs_v2 as any[])?.length >= limit) warnings.push(`activity_logs_v2 truncated at ${limit}`);

  // Outbound engine history (join by campaign IDs to avoid cross-workspace leakage)
  const send_logs = campaignIds.length
    ? (await safeSelect(
        supabase.from("send_logs").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }).limit(limit)
      )).data
    : [];
  if ((send_logs as any[])?.length >= limit) warnings.push(`send_logs truncated at ${limit}`);

  const send_queue = campaignIds.length
    ? (await safeSelect(
        supabase.from("send_queue").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }).limit(limit)
      )).data
    : [];
  if ((send_queue as any[])?.length >= limit) warnings.push(`send_queue truncated at ${limit}`);

  const dead_letters = campaignIds.length
    ? (await safeSelect(
        supabase.from("dead_letters").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }).limit(limit)
      )).data
    : [];
  if ((dead_letters as any[])?.length >= limit) warnings.push(`dead_letters truncated at ${limit}`);

  const provider_event_logs = campaignIds.length
    ? (await safeSelect(
        supabase.from("provider_event_logs").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false }).limit(limit)
      )).data
    : [];
  if ((provider_event_logs as any[])?.length >= limit) warnings.push(`provider_event_logs truncated at ${limit}`);

  // Inbox (best-effort; schema varies)
  const inbox_threads = settings.export_activity_logs
    ? (await safeSelect(
        supabase.from("inbox_threads").select("*").eq("workspace_id", workspace_id).order("updated_at", { ascending: false }).limit(limit)
      )).data
    : null;
  if ((inbox_threads as any[])?.length >= limit) warnings.push(`inbox_threads truncated at ${limit}`);

  const inbox_messages = settings.export_activity_logs
    ? (await safeSelect(
        supabase.from("inbox_messages").select("*").eq("workspace_id", workspace_id).order("created_at", { ascending: false }).limit(limit)
      )).data
    : null;
  if ((inbox_messages as any[])?.length >= limit) warnings.push(`inbox_messages truncated at ${limit}`);

  // Rollups (seasonality + reply patterns)
  const monthly_outreach = await safeSelect(
    supabase.from("mv_workspace_monthly_outreach").select("*").eq("workspace_id", workspace_id).order("month", { ascending: false }).limit(36)
  );
  const contact_patterns = await safeSelect(
    supabase.from("mv_contact_reply_patterns").select("*").eq("workspace_id", workspace_id).order("reply_rate_pct", { ascending: false }).limit(5000)
  );

  const payload = {
    exported_at: new Date().toISOString(),
    workspace_id,
    requested_by: { user_id: user.id, role },
    limits: { per_table: limit },
    settings,
    warnings,
    data: {
      workspace,
      workspace_members: workspace_members ?? [],
      campaigns: campaigns ?? [],
      contacts,
      leads,
      timeline_events,
      activity_logs_v2,
      send_logs,
      send_queue,
      dead_letters,
      provider_event_logs,
      inbox_threads,
      inbox_messages,
      rollups: {
        mv_workspace_monthly_outreach: monthly_outreach.data ?? [],
        mv_contact_reply_patterns: contact_patterns.data ?? [],
      },
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="smartsend-workspace-export-${workspace_id}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}



