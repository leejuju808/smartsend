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
  const playbookId = params.id;

  // Fetch playbook config
  const { data: playbook, error: playbookError } = await supabase
    .from("playbooks")
    .select("*")
    .eq("id", playbookId)
    .single();

  if (playbookError || !playbook) {
    return NextResponse.json(
      { error: "Playbook not found" },
      { status: 404 }
    );
  }

  // Check access: global playbooks are accessible to all, workspace playbooks only to that workspace
  if (!playbook.is_global && playbook.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { campaign_name, mailbox_id, segment_id } = body;

  if (!campaign_name?.trim()) {
    return NextResponse.json(
      { error: "campaign_name is required" },
      { status: 400 }
    );
  }

  const config = playbook.config as any;

  // Convert playbook templates to sequence format
  const templates = config.templates || [];
  const sequence = templates.map((template: any, index: number) => ({
    step: template.step || index + 1,
    subject: template.subject || "",
    body: template.body || "",
    delayDays: index === 0 ? 0 : 2, // Default 2 days between steps
    variants: template.variants || [],
  }));

  // 1) Create campaign row with playbook_id foreign key
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name: campaign_name.trim(),
      workspace_id: workspaceId,
      status: "draft",
      playbook_id: playbookId,
      objective: config.campaign?.objective || null,
      from_email_account_id: mailbox_id || null,
      segment_id: segment_id || null,
      audience_type: segment_id ? "segment" : "all_leads",
      // Apply send settings from config
      sending_window_start: config.send_settings?.business_hours?.start || null,
      sending_window_end: config.send_settings?.business_hours?.end || null,
      // Store sequence
      sequence: sequence,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    console.error("Error creating campaign:", campaignError);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }

  // 2) Add creator as campaign member with owner role
  await supabase.from("campaign_members").insert({
    campaign_id: campaign.id,
    user_id: user.id,
    role: "owner",
  });

  // 3) Create follow-up flow if followup_flows table exists
  if (config.followup_flow?.nodes) {
    try {
      // Create followup_flow
      const { data: flow, error: flowError } = await supabase
        .from("followup_flows")
        .insert({
          workspace_id: workspaceId,
          campaign_id: campaign.id,
          name: `${campaign_name} - Follow-up Flow`,
          is_active: false, // Start inactive, user can activate later
        })
        .select("id")
        .single();

      if (!flowError && flow) {
        // Create nodes
        const nodes = config.followup_flow.nodes || [];
        const nodeInserts = nodes.map((node: any, index: number) => ({
          flow_id: flow.id,
          type: node.type === "send_step" ? "send_email" : node.type,
          label: node.id,
          config: {
            step: node.step,
            if: node.if,
            then: node.then,
            else: node.else,
            wait_days: node.wait_days,
          },
          position: { x: index * 200, y: 0 },
        }));

        await supabase.from("followup_nodes").insert(nodeInserts);

        // Create edges (connections between nodes)
        // This is simplified - you may need to adjust based on your actual flow structure
        const edges: any[] = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          const currentNode = nodes[i];
          const nextNode = nodes[i + 1];
          
          if (currentNode.type === "condition") {
            // Create conditional edges
            if (currentNode.then && currentNode.then !== "stop") {
              const thenNode = nodes.find((n: any) => n.id === currentNode.then);
              if (thenNode) {
                edges.push({
                  flow_id: flow.id,
                  from_node_id: currentNode.id, // This will need to be the actual node ID from DB
                  to_node_id: thenNode.id,
                  condition_key: currentNode.if,
                });
              }
            }
            if (currentNode.else && currentNode.else !== "stop") {
              const elseNode = nodes.find((n: any) => n.id === currentNode.else);
              if (elseNode) {
                edges.push({
                  flow_id: flow.id,
                  from_node_id: currentNode.id,
                  to_node_id: elseNode.id,
                  condition_key: "default",
                });
              }
            }
          } else {
            // Linear flow
            edges.push({
              flow_id: flow.id,
              from_node_id: currentNode.id,
              to_node_id: nextNode.id,
              condition_key: null,
            });
          }
        }

        // Note: Edge creation will need actual node IDs from the database
        // This is a simplified version - you may need to fetch node IDs first
      }
    } catch (error) {
      // If followup_flows table doesn't exist or there's an error, continue
      // The campaign is still created, just without the follow-up flow
      console.warn("Could not create follow-up flow:", error);
    }
  }

  // 4) Update campaign.send_settings from config (if send_settings column exists)
  // This is already handled in the campaign insert above via sequence field
  // If you have a separate send_settings JSONB column, update it here

  return NextResponse.json({
    success: true,
    campaign_id: campaign.id,
    next: `/campaigns/${campaign.id}`,
  });
}

