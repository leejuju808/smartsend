import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.account_id) {
    await supabase.rpc("set_account", { p_account_id: membership.account_id });
  }

  const edgeUrl = process.env.EDGE_ENRICH_URL;
  if (!edgeUrl) {
    return NextResponse.json({ error: "EDGE_ENRICH_URL not configured" }, { status: 500 });
  }

  const res = await fetch(edgeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });

  if (!res.ok) {
    const body = await safeJson(res);
    return NextResponse.json({ error: "Edge failed", detail: body }, { status: 500 });
  }

  const payload = await safeJson(res);
  return NextResponse.json(payload);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return await res.text();
  }
}

