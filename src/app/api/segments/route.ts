import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", u.user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ ok:false, error:"No workspace found" }, { status:400 });

  const { data, error } = await supabase.from("segments").select("*").eq("workspace_id", workspaceId).order("created_at",{ascending:false});
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true, segments:data });
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", u.user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) return NextResponse.json({ ok:false, error:"No workspace found" }, { status:400 });

  const body = await req.json().catch(()=>({}));
  const name = (body.name||"").trim();
  const definition = body.definition ?? { op:"and", rules:[] };
  if (!name) return NextResponse.json({ ok:false, error:"name required" }, { status:400 });

  const { error } = await supabase.from("segments").insert({ workspace_id: workspaceId, name, definition });
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
} 