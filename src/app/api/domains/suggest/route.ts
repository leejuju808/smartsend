import { NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";

const BLOCK = new Set(["gmail.com","yahoo.com","outlook.com","icloud.com","hotmail.com"]);

export async function GET() {
  const { userId, status } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error:"Not authed" }, { status:401 });

  // who am I
  const { data: me } = await supabaseAdmin
    .from("profiles").select("email, team_id").eq("id", userId).maybeSingle();
  if (!me?.email) return NextResponse.json({ domains: [] });

  const domain = me.email.split("@")[1]?.toLowerCase();
  if (!domain || BLOCK.has(domain)) return NextResponse.json({ domains: [] });

  // already verified/claimed?
  const { data: claimed } = await supabaseAdmin
    .from("company_domains").select("verified, team_id").eq("domain", domain).maybeSingle();
  if (claimed?.verified) return NextResponse.json({ domains: [] });

  // how many signups from this domain in last 30d?
  const { data: agg } = await supabaseAdmin
    .from("recent_domain_signups").select("*").eq("domain", domain).maybeSingle();

  // nudge if >= 3 signups or (>=2 and user is Pro)
  const { data: sub } = await supabaseAdmin
    .from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
  const isPro = (sub?.subscription_status === "pro");

  const shouldSuggest = !!agg && (agg.users_30d >= 3 || (agg.users_30d >= 2 && isPro));
  if (!shouldSuggest) return NextResponse.json({ domains: [] });

  return NextResponse.json({
    domains: [{ domain, users_30d: agg.users_30d, first_seen: agg.first_seen, last_seen: agg.last_seen }]
  });
} 