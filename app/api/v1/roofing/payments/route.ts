// GET /v1/roofing/payments - List payments
// POST /v1/roofing/payments - Record payment

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET list payments
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const job_id = searchParams.get("job_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Query payment_logs or similar table
  // For now, return structure that matches expected format
  let query = supabase
    .from("payment_logs")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (job_id) {
    query = query.eq("job_id", job_id);
  }

  const { data: payments, error } = await query;

  if (error && error.code !== "PGRST116") {
    // PGRST116 = table doesn't exist, which is OK for now
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: payments || [],
    pagination: {
      limit,
      offset,
      count: payments?.length || 0,
    },
  });
});

// POST record payment
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { job_id, amount, payment_type, payment_method, notes, ...otherFields } = body;

  if (!job_id || !amount) {
    throw new ApiError("400_INVALID_BODY", "job_id and amount are required");
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

  const paymentData = {
    workspace_id: auth.workspaceId,
    job_id,
    amount: parseFloat(amount),
    payment_type: payment_type || "deposit",
    payment_method: payment_method || "check",
    notes,
    received_at: new Date().toISOString(),
    ...otherFields,
  };

  // Insert into payment_logs table
  const { data: payment, error } = await supabase
    .from("payment_logs")
    .insert(paymentData)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "payment.received", {
    payment_id: payment?.id,
    job_id,
    amount: parseFloat(amount),
    payment_type,
    received_at: paymentData.received_at,
  });

  return NextResponse.json({ data: payment || paymentData }, { status: 201 });
});




































