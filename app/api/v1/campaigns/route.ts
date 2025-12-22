// GET /v1/campaigns - List campaigns
// POST /v1/campaigns - Create a new campaign

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

// GET /v1/campaigns
export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const searchParams = req.nextUrl.searchParams;
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const limitClamped = Math.min(Math.max(limit, 1), 100);

  let query = supabase
    .from("campaigns")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .limit(limitClamped);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: campaigns, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  const nextCursor =
    campaigns && campaigns.length === limitClamped
      ? campaigns[campaigns.length - 1].created_at
      : null;

  return NextResponse.json({
    data: campaigns || [],
    pagination: {
      cursor: nextCursor,
      limit: limitClamped,
      has_more: nextCursor !== null,
    },
  });
});

// POST /v1/campaigns
export const POST = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { name, objective, status, from_email_account_id, daily_send_cap } = body;

  if (!name) {
    throw new ApiError("400_INVALID_BODY", "name is required");
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: auth.workspaceId,
      name,
      objective: objective || null,
      status: status || "draft",
      from_email_account_id: from_email_account_id || null,
      daily_send_cap: daily_send_cap || null,
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ data: campaign }, { status: 201 });
});



