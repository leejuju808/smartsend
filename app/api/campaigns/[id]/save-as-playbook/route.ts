import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;
  const campaignId = params.id;

  // Check if user is admin/owner
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  const isAdmin =
    teamMember?.role === "owner" ||
    teamMember?.role === "admin" ||
    workspaceMember?.role === "owner" ||
    workspaceMember?.role === "admin";

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only workspace owners/admins can create playbooks" },
      { status: 403 }
    );
  }

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const { name, description, category, slug } = body;

  if (!name?.trim()) {
    return NextResponse.json(
      { error: "Playbook name is required" },
      { status: 400 }
    );
  }

  // Build config from campaign
  const config: any = {
    campaign: {
      name: campaign.name,
      objective: campaign.objective || null,
    },
    templates: campaign.sequence || [],
    send_settings: {
      respect_local_timezones: true,
      business_hours: {
        start: campaign.sending_window_start || "09:00",
        end: campaign.sending_window_end || "17:00",
      },
      avoid_weekends: true,
    },
  };

  // Try to fetch follow-up flow if it exists
  try {
    const { data: flow } = await supabase
      .from("followup_flows")
      .select("id")
      .eq("campaign_id", campaignId)
      .single();

    if (flow) {
      const { data: nodes } = await supabase
        .from("followup_nodes")
        .select("*")
        .eq("flow_id", flow.id)
        .order("created_at");

      if (nodes && nodes.length > 0) {
        config.followup_flow = {
          nodes: nodes.map((node) => ({
            id: node.label || node.id,
            type: node.type,
            config: node.config,
          })),
        };
      }
    }
  } catch (error) {
    // Follow-up flow doesn't exist or error fetching, continue without it
    console.warn("Could not fetch follow-up flow:", error);
  }

  // Generate slug if not provided
  const playbookSlug =
    slug?.trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  // Create playbook
  const { data: playbook, error: playbookError } = await supabase
    .from("playbooks")
    .insert({
      workspace_id: workspaceId,
      slug: playbookSlug,
      name: name.trim(),
      description: description?.trim() || null,
      category: category || null,
      config: config,
      is_global: false,
    })
    .select("id")
    .single();

  if (playbookError || !playbook) {
    console.error("Error creating playbook:", playbookError);
    return NextResponse.json(
      { error: "Failed to create playbook" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    playbook_id: playbook.id,
  });
}








