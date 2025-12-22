// PATCH /v1/leads/{id} - Update a lead
// DELETE /v1/leads/{id} - Delete a lead (GDPR erase or hard delete)

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// PATCH /v1/leads/{id}
export const PATCH = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const leadId = req.nextUrl.pathname.split("/").pop();
  if (!leadId) {
    throw new ApiError("400_INVALID_BODY", "Lead ID is required");
  }

  const body = await req.json();

  // Verify lead belongs to workspace
  const { data: existingLead, error: fetchError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !existingLead) {
    throw new ApiError("404_NOT_FOUND", "Lead not found");
  }

  // Build update object
  const updates: any = {};
  if (body.first_name !== undefined) updates.first_name = body.first_name;
  if (body.last_name !== undefined) updates.last_name = body.last_name;
  if (body.company !== undefined) updates.company = body.company;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.title !== undefined) updates.title = body.title;
  if (body.custom !== undefined) updates.custom = body.custom;
  if (body.status !== undefined) updates.status = body.status;
  if (body.intent !== undefined) updates.intent = body.intent;

  updates.updated_at = new Date().toISOString();

  const { data: updatedLead, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: updatedLead });
});

// DELETE /v1/leads/{id}
export const DELETE = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const leadId = req.nextUrl.pathname.split("/").pop();
  if (!leadId) {
    throw new ApiError("400_INVALID_BODY", "Lead ID is required");
  }

  const searchParams = req.nextUrl.searchParams;
  const hardDelete = searchParams.get("hard") === "true";

  // Verify lead belongs to workspace
  const { data: existingLead, error: fetchError } = await supabase
    .from("leads")
    .select("id, email")
    .eq("id", leadId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (fetchError || !existingLead) {
    throw new ApiError("404_NOT_FOUND", "Lead not found");
  }

  if (hardDelete) {
    // Hard delete
    const { error } = await supabase.from("leads").delete().eq("id", leadId);

    if (error) {
      throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
    }
  } else {
    // GDPR erase: anonymize data
    const { error } = await supabase
      .from("leads")
      .update({
        email: `deleted_${leadId}@deleted.local`,
        first_name: null,
        last_name: null,
        company: null,
        phone: null,
        title: null,
        custom: {},
        status: "deleted",
      })
      .eq("id", leadId);

    if (error) {
      throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
    }

    // Add to suppressions to prevent re-import
    await supabase.from("suppressions").insert({
      email: existingLead.email,
      workspace_id: auth.workspaceId,
      reason: "gdpr_erased",
    });
  }

  return NextResponse.json({ success: true });
});



