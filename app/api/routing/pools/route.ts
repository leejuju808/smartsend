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
    .from("owner_pools")
    .select("id, name, account_id, owner_pool_members(count)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const payload = (data ?? []).map((pool: any) => ({
    id: pool.id,
    name: pool.name,
    account_id: pool.account_id,
    member_count: pool.owner_pool_members?.[0]?.count ?? 0,
  }));

  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const { accountId, name }: { accountId?: string; name?: string } = await req.json();

  if (!accountId || !name) {
    return NextResponse.json({ error: "accountId and name are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_pools")
    .insert({ account_id: accountId, name })
    .select("id, name, account_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, pool: data });
}


