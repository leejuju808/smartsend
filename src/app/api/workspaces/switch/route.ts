// app/api/workspaces/switch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { workspaceId } = await req.json();
  if (!workspaceId) return new NextResponse("Missing workspaceId", { status: 400 });

  const supabase = getServerSupabase();
  // verify membership before setting cookie
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (!data?.length) return new NextResponse("Not a member", { status: 403 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("active_ws", workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
