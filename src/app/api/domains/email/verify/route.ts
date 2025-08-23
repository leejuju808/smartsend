import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { email, code } = await req.json();
  if (!email || !code) return NextResponse.json({ error: "Email and code required" }, { status: 400 });
  const domain = email.split("@")[1]?.toLowerCase();

  // fetch latest matching code
  const { data: row } = await supabaseAdmin
    .from("company_domain_email_verifications")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("code", String(code).trim().toUpperCase())
    .eq("used", false)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "Code expired" }, { status: 400 });
  }

  // confirm claim points to requester team
  const { data: mem } = await supabaseAdmin
    .from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: claim } = await supabaseAdmin
    .from("company_domains").select("id, team_id, verified").eq("domain", domain).maybeSingle();

  if (claim && claim.team_id !== mem.team_id)
    return NextResponse.json({ error: "Domain owned by another team" }, { status: 409 });

  // mark code used & mark domain verified
  await supabaseAdmin.from("company_domain_email_verifications").update({ used: true }).eq("id", row.id);

  if (claim) {
    await supabaseAdmin.from("company_domains").update({
      verified: true, verified_at: new Date().toISOString()
    }).eq("id", claim.id);
  } else {
    await supabaseAdmin.from("company_domains").insert({
      team_id: mem.team_id, domain, verified: true, verified_at: new Date().toISOString()
    });
  }

  return NextResponse.json({ ok: true, domain });
} 