import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(req: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = await req.json();
  
  if (!["viewer","editor"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  
  const { data: can } = await supabase.rpc("is_campaign_owner", { p_campaign: params.id });
  if (!can) return NextResponse.json({ error: "Only owner can update" }, { status: 403 });

  // Get old role for audit log
  const { data: oldShare } = await supabase
    .from("campaign_shares")
    .select("id, role")
    .eq("campaign_id", params.id)
    .eq("user_id", params.userId)
    .single();

  const { error } = await supabase
    .from("campaign_shares")
    .update({ role })
    .eq("campaign_id", params.id)
    .eq("user_id", params.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log audit event
  await supabase.rpc("log_audit", {
    p_actor: user.id,
    p_campaign: params.id,
    p_entity_type: "share",
    p_entity: oldShare?.id || params.userId,
    p_action: "role_change",
    p_meta: { role_from: oldShare?.role || null, role_to: role, user_id: params.userId }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { data: can } = await supabase.rpc("is_campaign_owner", { p_campaign: params.id });
  if (!can) return NextResponse.json({ error: "Only owner can remove" }, { status: 403 });

  // Get share info before deletion for audit log
  const { data: shareInfo } = await supabase
    .from("campaign_shares")
    .select("id, role")
    .eq("campaign_id", params.id)
    .eq("user_id", params.userId)
    .single();

  const { error } = await supabase
    .from("campaign_shares")
    .delete()
    .eq("campaign_id", params.id)
    .eq("user_id", params.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log audit event
  await supabase.rpc("log_audit", {
    p_actor: user.id,
    p_campaign: params.id,
    p_entity_type: "share",
    p_entity: shareInfo?.id || params.userId,
    p_action: "share_remove",
    p_meta: { role: shareInfo?.role || null, user_id: params.userId }
  });

  return NextResponse.json({ ok: true });
}



