import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { token, userId } = await req.json();
    if (!token || !userId) return NextResponse.json({ error: "token and userId required" }, { status: 400 });

    const sb = createClient(url, service, { auth: { persistSession: false } });

    const { data: inv, error: invErr } = await sb
      .from("org_invites")
      .select("*").eq("token", token).single();
    if (invErr || !inv) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 400 });
    if (inv.accepted_at) return NextResponse.json({ error: "Invite already used" }, { status: 400 });

    // seat check
    const { data: org } = await sb.from("organizations").select("id,seats").eq("id", inv.org_id).single();
    const { data: cnt } = await sb.rpc("org_member_count", { p_org: inv.org_id });
    if ((cnt ?? 0) >= (org?.seats ?? 1)) return NextResponse.json({ error: "No available seats" }, { status: 402 });

    // upsert membership
    await sb.from("org_members").upsert({ org_id: inv.org_id, user_id: userId, role: inv.role });
    await sb.from("org_invites").update({ accepted_by: userId, accepted_at: new Date().toISOString() }).eq("id", inv.id);

    return NextResponse.json({ ok: true, orgId: inv.org_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


