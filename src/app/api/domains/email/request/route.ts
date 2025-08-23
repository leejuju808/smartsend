import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";
import crypto from "crypto";

const BLOCK = new Set(["gmail.com","yahoo.com","outlook.com","icloud.com","hotmail.com"]);

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  // role check
  const { data: mem } = await supabaseAdmin
    .from("team_members").select("team_id, role").eq("user_id", userId).maybeSingle();
  if (!mem || (mem.role !== "owner" && mem.role !== "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email } = await req.json();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const domain = email.split("@")[1].toLowerCase();
  if (BLOCK.has(domain)) return NextResponse.json({ error: "Public email domains not allowed" }, { status: 400 });

  // ensure a pending claim exists or create unverified stub pointing to this team
  const { data: existingClaim } = await supabaseAdmin
    .from("company_domains").select("id, team_id, verified").eq("domain", domain).maybeSingle();

  if (existingClaim && existingClaim.team_id !== mem.team_id)
    return NextResponse.json({ error: "Domain claimed by another team" }, { status: 409 });

  if (!existingClaim) {
    await supabaseAdmin.from("company_domains").insert({
      team_id: mem.team_id, domain, verified: false, verify_token: null
    });
  }

  // simple rate limit: 3 active codes per domain
  const { data: activeCount } = await supabaseAdmin
    .from("company_domain_email_verifications")
    .select("id", { count: "exact", head: true })
    .eq("domain", domain).eq("used", false)
    .gt("expires_at", new Date().toISOString());
  if ((activeCount as any) >= 3) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const code = crypto.randomBytes(3).toString("hex").toUpperCase(); // e.g., "A9B3F1"
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabaseAdmin.from("company_domain_email_verifications").insert({
    domain, email: email.toLowerCase(), code, expires_at: expires, created_by: userId
  });

  // send email via your existing sender
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/emails/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: `Your SmartSendAI verification code: ${code}`,
        text: `Use this code to verify ${domain}: ${code}\nIt expires in 15 minutes.`
      })
    });
  } catch {}

  return NextResponse.json({ ok: true, expires_at: expires });
} 