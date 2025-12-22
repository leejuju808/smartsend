import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser(); if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const body = await req.json().catch(()=>({}));
  const allowed = ["exit_on_unsubscribe","exit_on_reply","exit_on_bounce","goal_on_click","goal_on_open"] as const;
  const updates: any = {};
  for (const k of allowed) if (body[k] !== undefined) updates[k] = !!body[k];

  const { error } = await supabase.from("sequences").update(updates).eq("id", params.id).eq("workspace_id", u.user.id);
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}