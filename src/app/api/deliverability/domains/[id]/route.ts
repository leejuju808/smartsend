import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const body = await req.json().catch(()=>({}));
  const updates: any = { updated_at: new Date().toISOString() };
  ["from_name","from_email","dkim_selector","notes"].forEach(k => {
    if (body[k] !== undefined) updates[k] = body[k];
  });

  const { error } = await supabase.from("sending_domains")
    .update(updates).eq("id", params.id).eq("workspace_id", u.user.id);

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const { error } = await supabase.from("sending_domains")
    .delete().eq("id", params.id).eq("workspace_id", u.user.id);

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}