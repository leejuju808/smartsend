import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { updateLeadScore } from "@/lib/lead-scoring";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const {
    lead_id,
    title,
    stage = "new",
    value,
    probability = 10,
    owner_id,
    next_action,
    next_action_due,
  } = body;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Validate required fields
  if (!lead_id && !title) {
    return NextResponse.json(
      { error: "Either lead_id or title is required" },
      { status: 400 }
    );
  }

  // If lead_id provided, get lead info
  let dealTitle = title;
  let dealOwnerId = owner_id;
  let dealLeadId = lead_id;

  if (lead_id) {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, company, owner_id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Verify workspace matches
    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate title if not provided
    if (!dealTitle) {
      const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.company || "Lead";
      dealTitle = `${name} — Deal`;
    }

    // Use lead's owner if no owner_id provided
    if (!dealOwnerId && lead.owner_id) {
      dealOwnerId = lead.owner_id;
    }

    dealLeadId = lead.id;
  }

  // If no owner_id yet, check deal assignment rules
  if (!dealOwnerId) {
    // Get active deal assignment rule
    const { data: dealRule } = await supabase
      .from("assignment_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("target", "deals")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (dealRule) {
      if (dealRule.type === "round_robin") {
        // Use round robin logic (simplified - could call RPC function)
        const members = dealRule.config?.members || [];
        if (members.length > 0) {
          const lastAssigned = dealRule.config?.last_assigned_user_id;
          const lastIndex = lastAssigned
            ? members.findIndex((m: any) => m.user_id === lastAssigned)
            : -1;
          const nextIndex = (lastIndex + 1) % members.length;
          dealOwnerId = members[nextIndex]?.user_id;

          // Update rule config
          await supabase
            .from("assignment_rules")
            .update({
              config: {
                ...dealRule.config,
                last_assigned_user_id: dealOwnerId,
              },
            })
            .eq("id", dealRule.id);
        }
      } else if (dealRule.type === "single_owner") {
        dealOwnerId = dealRule.config?.user_id;
      }
    }
  }

  // Validate stage
  const validStages = ["new", "working", "meeting", "proposal", "closed_won", "closed_lost"];
  if (!validStages.includes(stage)) {
    return NextResponse.json(
      { error: `Invalid stage. Must be one of: ${validStages.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate probability
  if (probability < 0 || probability > 100) {
    return NextResponse.json(
      { error: "Probability must be between 0 and 100" },
      { status: 400 }
    );
  }

  // Create deal
  const { data: deal, error: insertError } = await supabase
    .from("deals")
    .insert({
      workspace_id: workspaceId,
      lead_id: dealLeadId,
      owner_id: dealOwnerId,
      title: dealTitle,
      stage,
      value,
      probability,
      next_action,
      next_action_due,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 400 }
    );
  }

  // Log deal creation activity
  await supabase
    .from("deal_activity")
    .insert({
      deal_id: deal.id,
      type: "note",
      body: "Deal created",
      metadata: {
        created_manually: true,
      },
    });

  // Block 273: Update lead score for deal creation
  if (dealLeadId) {
    updateLeadScore(dealLeadId, "deal_created", workspaceId);
  }

  return NextResponse.json({ deal });
}


