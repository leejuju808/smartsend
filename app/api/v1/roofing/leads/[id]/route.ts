// GET /v1/roofing/leads/:id - Get single lead
// PATCH /v1/roofing/leads/:id - Update lead

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET single lead
export const GET = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (error || !lead) {
    throw new ApiError("404_NOT_FOUND", "Lead not found", 404);
  }

  return NextResponse.json({ data: lead });
});

// PATCH update lead
export const PATCH = withApiAuth(async (
  req: NextRequest,
  auth,
  { params }: { params: { id: string } }
) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { status, first_name, last_name, phone, custom, ...otherFields } = body;

  // Build update object
  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (phone !== undefined) updates.phone = phone;
  if (custom !== undefined) updates.custom = custom;
  updates.updated_at = new Date().toISOString();

  const { data: lead, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", params.id)
    .eq("workspace_id", auth.workspaceId)
    .select()
    .single();

  if (error || !lead) {
    throw new ApiError("404_NOT_FOUND", "Lead not found", 404);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "lead.updated", {
    lead_id: lead.id,
    changes: updates,
    updated_at: lead.updated_at,
  });

  return NextResponse.json({ data: lead });
});




































