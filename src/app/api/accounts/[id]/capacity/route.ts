import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify user owns this account
  const { data: account } = await sb.from("connected_accounts")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await sb.rpc("account_remaining_capacity", { p_account: params.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ remaining: data ?? 0 });
}

