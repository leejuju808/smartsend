// POST /v1/roofing/materials/delivery - Record material delivery

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { job_id, items, delivery_date, delivery_notes, ...otherFields } = body;

  if (!job_id || !items || !Array.isArray(items)) {
    throw new ApiError("400_INVALID_BODY", "job_id and items array are required");
  }

  // Verify job exists
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("id")
    .eq("id", job_id)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (!job) {
    throw new ApiError("404_NOT_FOUND", "Job not found", 404);
  }

  const deliveryData = {
    workspace_id: auth.workspaceId,
    job_id,
    items,
    delivery_date: delivery_date || new Date().toISOString(),
    delivery_notes,
    status: "delivered",
    ...otherFields,
  };

  // Insert into material_deliveries table (if exists)
  const { data: delivery, error } = await supabase
    .from("material_deliveries")
    .insert(deliveryData)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "material.delivered", {
    delivery_id: delivery?.id,
    job_id,
    items,
    delivery_date: deliveryData.delivery_date,
  });

  return NextResponse.json({ data: delivery || deliveryData }, { status: 201 });
});




































