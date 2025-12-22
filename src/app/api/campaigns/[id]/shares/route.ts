import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaign_id = params.id;
  const { email, role } = await req.json();

  if (!email || !role) return NextResponse.json({ error: "email and role required" }, { status: 400 });
  if (!["viewer","editor"].includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  // find user by email
  try {
    const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers({ 
      page: 1, 
      perPage: 1, 
      emailFilter: email as string 
    } as any);
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 400 });
    const user = usersList?.users?.[0];
    if (!user) {
      // Fallback: try profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!profile) return NextResponse.json({ error: "user not found" }, { status: 404 });
      const user_id = profile.id;

      // prevent sharing to owner (no-op)
      const { data: camp } = await supabase.from("campaigns").select("user_id").eq("id", campaign_id).maybeSingle();
      if (camp?.user_id === user_id) return NextResponse.json({ ok: true, note: "user is owner" });

      // Check seat limits before adding (only for new shares, not updates)
      const { data: existingShare } = await supabase
        .from("campaign_shares")
        .select("user_id")
        .eq("campaign_id", campaign_id)
        .eq("user_id", user_id)
        .maybeSingle();
      
      if (!existingShare) {
        // This is a new share, check seat limit
        const { data: seatCheck } = await supabase.rpc("can_add_collaborator", { p_campaign: campaign_id });
        const { ok, seats_used, seat_limit } = (seatCheck ?? {}) as any;
        if (!ok) {
          return NextResponse.json({ 
            error: "seat_limit_reached", 
            seats_used, 
            seat_limit 
          }, { status: 400 });
        }
      }

      const { error } = await supabase.from("campaign_shares").upsert({ campaign_id, user_id, role }, { onConflict: "campaign_id,user_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      return NextResponse.json({ ok: true });
    }

    const user_id = user.id;

    // prevent sharing to owner (no-op)
    const { data: camp } = await supabase.from("campaigns").select("user_id").eq("id", campaign_id).maybeSingle();
    if (camp?.user_id === user_id) return NextResponse.json({ ok: true, note: "user is owner" });

    // Check seat limits before adding (only for new shares, not updates)
    const { data: existingShare } = await supabase
      .from("campaign_shares")
      .select("user_id")
      .eq("campaign_id", campaign_id)
      .eq("user_id", user_id)
      .maybeSingle();
    
    if (!existingShare) {
      // This is a new share, check seat limit
      const { data: seatCheck } = await supabase.rpc("can_add_collaborator", { p_campaign: campaign_id });
      const { ok, seats_used, seat_limit } = (seatCheck ?? {}) as any;
      if (!ok) {
        return NextResponse.json({ 
          error: "seat_limit_reached", 
          seats_used, 
          seat_limit 
        }, { status: 400 });
      }
    }

    const { error } = await supabase.from("campaign_shares").upsert({ campaign_id, user_id, role }, { onConflict: "campaign_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to find user" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaign_id = params.id;
  const { user_id, role } = await req.json();
  if (!user_id || !role) return NextResponse.json({ error: "user_id and role required" }, { status: 400 });
  if (!["viewer","editor"].includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  // prevent downgrading owner
  const { data: camp } = await supabase.from("campaigns").select("user_id").eq("id", campaign_id).maybeSingle();
  if (camp?.user_id === user_id) return NextResponse.json({ error: "cannot change owner role" }, { status: 400 });

  const { error } = await supabase.from("campaign_shares").update({ role }).eq("campaign_id", campaign_id).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const campaign_id = params.id;
  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get("user_id");
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  // block removing owner
  const { data: camp } = await supabase.from("campaigns").select("user_id").eq("id", campaign_id).maybeSingle();
  if (camp?.user_id === user_id) return NextResponse.json({ error: "cannot remove owner" }, { status: 400 });

  const { error } = await supabase.from("campaign_shares").delete().eq("campaign_id", campaign_id).eq("user_id", user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

