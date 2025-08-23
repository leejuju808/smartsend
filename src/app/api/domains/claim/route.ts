import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { data: me } = await supabaseAdmin
    .from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { domain } = await req.json();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
    return NextResponse.json({ error: "Bad domain" }, { status: 400 });

  const token = crypto.randomBytes(10).toString("hex");
  const { data: existing } = await supabaseAdmin
    .from("company_domains").select("id, verified, team_id").eq("domain", domain).maybeSingle();

  if (existing?.verified) return NextResponse.json({ error: "Already verified" }, { status: 400 });
  
  // Block cross-team domain clashes
  if (existing && existing.team_id !== me.team_id)
    return NextResponse.json({ error: "Domain already claimed by another team" }, { status: 409 });

  await supabaseAdmin.from("company_domains").upsert({
    team_id: me.team_id, domain: domain.toLowerCase(), verify_token: token, verified: false
  }, { onConflict: "domain" });

  return NextResponse.json({
    ok: true,
    instructions: `Add a DNS TXT record: _smartsend.${domain}  TXT  smartsend-verify=${token}`
  });
} 