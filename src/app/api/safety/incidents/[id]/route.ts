// PATCH /api/safety/incidents/[id] - Update incident (e.g., mark as resolved)
// DELETE /api/safety/incidents/[id] - Delete incident

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { resolved, corrective_action, description, severity } = body;

    // Verify incident belongs to company
    const { data: incident } = await supabase
      .from("safety_incidents")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const updateData: any = {};

    if (resolved !== undefined) {
      updateData.resolved = resolved;
      if (resolved) {
        updateData.resolved_at = new Date().toISOString();
      } else {
        updateData.resolved_at = null;
      }
    }

    if (corrective_action !== undefined) {
      updateData.corrective_action = corrective_action;
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    if (severity !== undefined) {
      updateData.severity = severity;
    }

    const { data: updated, error } = await supabase
      .from("safety_incidents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating incident:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ incident: updated });
  } catch (error: any) {
    console.error("Error in PATCH /api/safety/incidents/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { id } = await params;

    // Verify incident belongs to company
    const { data: incident } = await supabase
      .from("safety_incidents")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("safety_incidents")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting incident:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/safety/incidents/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























