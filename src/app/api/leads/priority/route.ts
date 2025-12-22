import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get user's org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  // Use the view_lead_priority view to get leads with scores
  const { data, error } = await supabase
    .from("view_lead_priority")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("priority", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data ?? [] });
}

