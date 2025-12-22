import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("account_id", accountId)
    .order("priority", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { accountId, match_type, match_value, action, pool_id, user_id, priority } = await req.json();

  if (!accountId || !match_type || !match_value || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  const record: Record<string, any> = {
    account_id: accountId,
    match_type,
    match_value,
    action,
    priority: typeof priority === "number" ? priority : 100,
    pool_id: action === "assign_pool" ? pool_id ?? null : null,
    user_id: action === "assign_user" ? user_id ?? null : null,
  };

  const { data, error } = await supabase.from("routing_rules").insert(record).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, rule: data });
}


