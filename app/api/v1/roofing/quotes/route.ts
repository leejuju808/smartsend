// GET /v1/roofing/quotes - List quotes/proposals
// POST /v1/roofing/quotes - Create quote

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";
import { triggerWebhooks } from "@/lib/api/webhooks";

// GET list quotes
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const lead_id = searchParams.get("lead_id");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  let query = supabase
    .from("proposals")
    .select(`
      id,
      lead_id,
      thread_id,
      contact_id,
      workspace_id,
      status,
      proposal_data,
      proposal_text,
      pdf_url,
      email_sent_at,
      email_opened_at,
      email_clicked_at,
      created_at,
      updated_at
    `)
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  if (lead_id) {
    query = query.eq("lead_id", lead_id);
  }

  const { data: quotes, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: quotes || [],
    pagination: {
      limit,
      offset,
      count: quotes?.length || 0,
    },
  });
});

// POST create quote
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const {
    lead_id,
    thread_id,
    contact_id,
    proposal_data,
    proposal_text,
    status = "draft",
    ...otherFields
  } = body;

  if (!lead_id && !thread_id && !contact_id) {
    throw new ApiError("400_INVALID_BODY", "lead_id, thread_id, or contact_id is required");
  }

  if (!proposal_data && !proposal_text) {
    throw new ApiError("400_INVALID_BODY", "proposal_data or proposal_text is required");
  }

  const { data: quote, error } = await supabase
    .from("proposals")
    .insert({
      workspace_id: auth.workspaceId,
      lead_id,
      thread_id,
      contact_id,
      proposal_data: proposal_data || {},
      proposal_text,
      status,
      ...otherFields,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  // Trigger webhook
  await triggerWebhooks(auth.workspaceId, "quote.sent", {
    quote_id: quote.id,
    lead_id: quote.lead_id,
    status: quote.status,
    created_at: quote.created_at,
  });

  return NextResponse.json({ data: quote }, { status: 201 });
});




































