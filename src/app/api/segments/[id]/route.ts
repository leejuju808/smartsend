import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params:{ id:string }}) {
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

  const { data, error } = await supabase.from("segments").select("*").eq("id", params.id).single();
  if (error || !data || data.workspace_id !== workspaceId) return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });
  return NextResponse.json({ ok:true, segment:data });
}

export async function PATCH(req: NextRequest, { params }: { params:{ id:string }}) {
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
  const updates: any = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.definition !== undefined) updates.definition = body.definition;
  if (body.status !== undefined) updates.status = body.status;
  const { error } = await supabase.from("segments").update(updates).eq("id", params.id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}

export async function DELETE(_: NextRequest, { params }: { params:{ id:string }}) {
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

  const { error } = await supabase.from("segments").delete().eq("id", params.id).eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
} 