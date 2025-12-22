// GET /v1/roofing/leads - List leads
// GET /v1/roofing/leads?status=new&limit=50&offset=0

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const email = searchParams.get("email");
  const pipeline = searchParams.get("pipeline");

  let query = supabase
    .from("leads")
    .select(`
      id,
      email,
      first_name,
      last_name,
      phone,
      company,
      title,
      status,
      custom,
      created_at,
      updated_at,
      reply_detected,
      reply_summary
    `)
    .eq("workspace_id", auth.workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  if (email) {
    query = query.ilike("email", `%${email}%`);
  }

  const { data: leads, error } = await query;

  if (error) {
    throw new ApiError("500_INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({
    data: leads || [],
    pagination: {
      limit,
      offset,
      count: leads?.length || 0,
    },
  });
});




































