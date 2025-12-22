// app/api/team/invites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("workspaceId");
  if (!ws) return new NextResponse("Missing workspaceId", { status: 400 });
  
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, email, role, created_at, expires_at, accepted_at")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false });
    
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data ?? []);
}
