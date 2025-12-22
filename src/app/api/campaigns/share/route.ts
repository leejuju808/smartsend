import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { campaignId, orgId, actorId } = await req.json();
    if (!campaignId || !orgId || !actorId) return NextResponse.json({ error: "campaignId, orgId, actorId required" }, { status: 400 });

    const sb = createClient(url, service, { auth: { persistSession: false } });

    // ensure actor is in org
    const { data: mem } = await sb.from("org_members").select("role").eq("org_id", orgId).eq("user_id", actorId).maybeSingle();
    if (!mem) return NextResponse.json({ error: "Not a member of this org" }, { status: 403 });

    const { error } = await sb.from("campaigns").update({ owner_org_id: orgId }).eq("id", campaignId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


