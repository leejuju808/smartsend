import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getEntitlements } from "@/lib/entitlements";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, teamId } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status")
    .eq("id", userId)
    .single();

  const ents = getEntitlements(prof?.subscription_status);

  const { count } = await supabaseAdmin
    .from("sequences")
    .select("id", { count: "exact", head: true })
    .eq("owner", userId)
    .neq("status", "demo");

  if ((count ?? 0) >= ents.max_sequences) {
    return NextResponse.json({
      ok: false,
      code: "limit_sequences",
      upgrade_url: "/dashboard/billing/upgrade",
      message: `Free plan allows ${ents.max_sequences} sequence. Upgrade to create more.`,
    }, { status: 402 });
  }

  const { data, error } = await supabaseAdmin
    .from("sequences")
    .insert({ owner: userId, name, status: "draft", team_id: teamId || null })
    .select("id,name,status,created_at")
    .single();

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true, sequence: data });
}

