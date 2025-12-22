import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/service-tickets - List service tickets
export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status");
  const urgency = searchParams.get("urgency");
  const covered = searchParams.get("covered");
  const issue_type = searchParams.get("issue_type");
  const lead_id = searchParams.get("lead_id");
  const job_id = searchParams.get("job_id");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    let query = supabaseAdmin
      .from("service_tickets")
      .select(
        `
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        jobs:job_id (
          id,
          stage,
          contract_value
        )
        `,
        { count: "exact" }
      )
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (urgency) {
      query = query.eq("urgency", urgency);
    }

    if (covered !== null) {
      query = query.eq("covered", covered === "true");
    }

    if (issue_type) {
      query = query.eq("issue_type", issue_type);
    }

    if (lead_id) {
      query = query.eq("lead_id", lead_id);
    }

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching service tickets:", error);
      return NextResponse.json(
        { error: "Failed to fetch service tickets" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tickets: data || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("Error in GET /api/service-tickets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/service-tickets - Create a new service ticket
export async function POST(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const body = await req.json();

  const {
    lead_id,
    job_id,
    issue_type,
    urgency = "normal",
    description,
    covered,
    warranty_determination = "pending",
    recommended_action,
  } = body;

  if (!description) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  try {
    const { data: ticket, error: insertError } = await supabaseAdmin
      .from("service_tickets")
      .insert({
        workspace_id,
        lead_id: lead_id || null,
        job_id: job_id || null,
        issue_type: issue_type || "unknown",
        urgency,
        description,
        covered: covered !== undefined ? covered : null,
        warranty_determination,
        recommended_action,
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating service ticket:", insertError);
      return NextResponse.json(
        { error: "Failed to create service ticket", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































