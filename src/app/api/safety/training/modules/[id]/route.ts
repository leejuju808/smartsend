// PATCH /api/safety/training/modules/[id] - Update training module
// DELETE /api/safety/training/modules/[id] - Delete training module

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
    const {
      title,
      description,
      content_url,
      module_type,
      required_for_roles,
      expires_after_days,
      estimated_duration_minutes,
    } = body;

    // Verify module belongs to company
    const { data: module } = await supabase
      .from("safety_training_modules")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (content_url !== undefined) updateData.content_url = content_url;
    if (module_type !== undefined) updateData.module_type = module_type;
    if (required_for_roles !== undefined) updateData.required_for_roles = required_for_roles;
    if (expires_after_days !== undefined) updateData.expires_after_days = expires_after_days;
    if (estimated_duration_minutes !== undefined) updateData.estimated_duration_minutes = estimated_duration_minutes;

    const { data: updated, error } = await supabase
      .from("safety_training_modules")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating module:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ module: updated });
  } catch (error: any) {
    console.error("Error in PATCH /api/safety/training/modules/[id]:", error);
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

    // Verify module belongs to company
    const { data: module } = await supabase
      .from("safety_training_modules")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("safety_training_modules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting module:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/safety/training/modules/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























