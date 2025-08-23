import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import dns from "dns/promises";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: "Bad domain" }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from("company_domains").select("*").eq("domain", domain.toLowerCase()).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // check TXT record
  let ok = false;
  try {
    const name = `_smartsend.${domain}`;
    const records = await dns.resolveTxt(name);
    ok = records.flat().some(v => v.includes(`smartsend-verify=${row.verify_token}`));
  } catch {}

  if (!ok) return NextResponse.json({ ok: false, message: "TXT not found" });

  await supabaseAdmin.from("company_domains").update({
    verified: true, verified_at: new Date().toISOString()
  }).eq("id", row.id);

  return NextResponse.json({ ok: true });
} 