import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const workspaceId = await authenticateApiKey(req);
    const leadId = params.id;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify lead belongs to workspace
    const { data: lead } = await supabase
      .from("leads")
      .select("workspace_id")
      .eq("id", leadId)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "lead_not_in_workspace" },
        { status: 403 }
      );
    }

    // Get email events for this lead
    // Select all available columns - step_id and variant_id may not exist in all schemas
    const { data: events, error } = await supabase
      .from("email_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: events || [] });
  } catch (err: any) {
    if (err.message === "missing_api_key") {
      return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
    }
    if (err.message === "invalid_api_key") {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

