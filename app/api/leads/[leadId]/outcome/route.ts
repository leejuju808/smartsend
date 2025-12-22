// app/api/leads/[leadId]/outcome/route.ts
// Block 8710 — Lead Outcome & Job Logging
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Outcome = "open" | "won" | "lost";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: {
    outcome?: Outcome;
    won_value?: number | null;
    notes?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // First, verify the lead exists and user has access
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id, owner_id")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: "Lead not found" },
      { status: 404 }
    );
  }

  // Verify user has access via workspace or owner_id
  let hasAccess = false;
  if (lead.owner_id === user.id) {
    hasAccess = true;
  } else if (lead.workspace_id) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", lead.workspace_id)
      .maybeSingle();
    hasAccess = !!membership;
  }

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Not authorized to update this lead" },
      { status: 403 }
    );
  }

  const update: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.outcome !== undefined) {
    update.outcome = body.outcome;
    
    // Also update status field for compatibility with pipeline board
    if (body.outcome === "won" || body.outcome === "lost") {
      update.status = body.outcome;
    }
    
    if (body.outcome === "won") {
      // Auto-set won_at when outcome becomes won
      update.won_at = new Date().toISOString();
    } else if (body.outcome !== "won") {
      // If switching back to open/lost, clear won_at
      update.won_at = null;
    }
  }

  if (typeof body.won_value === "number") {
    update.won_value = body.won_value;
  } else if (body.won_value === null) {
    update.won_value = null;
  }

  if (body.notes !== undefined) {
    update.notes = body.notes;
  }

  // Get old outcome before update
  const oldOutcome = lead.outcome || null;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .select("id, outcome, won_value, won_at, notes, status")
    .single();

  if (error || !data) {
    console.error("Error updating lead outcome:", error);
    return NextResponse.json(
      { error: "Failed to update lead outcome" },
      { status: 500 }
    );
  }

  // Block 21977: Trigger win/loss reason detection when outcome changes to won/lost
  if (body.outcome && (body.outcome === "won" || body.outcome === "lost") && oldOutcome !== body.outcome) {
    try {
      const edgeBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (edgeBaseUrl && serviceRoleKey) {
        const edgeFunctionUrl = `${edgeBaseUrl}/functions/v1/detect-win-loss-reason`;
        
        // Call edge function asynchronously (don't wait for response)
        fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            lead_id: leadId,
            status: body.outcome,
          }),
        }).catch((err) => {
          console.error("Failed to trigger win/loss reason detection:", err);
          // Don't fail the request if edge function call fails
        });
      }
    } catch (err) {
      console.error("Error triggering win/loss reason detection:", err);
      // Don't fail the request if edge function call fails
    }
  }

  return NextResponse.json(data, { status: 200 });
}

