import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Params = {
  params: { id: string };
};

export async function POST(_req: Request, { params }: Params) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const accountId = params.id;
  if (!accountId) {
    return NextResponse.json({ error: "Missing provider account id" }, { status: 400 });
  }

  const { data: providerAccount, error: fetchError } = await supabase
    .from("provider_accounts")
    .select("id, account_id")
    .eq("id", accountId)
    .eq("account_id", user.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!providerAccount) {
    return NextResponse.json({ error: "Provider account not found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("provider_accounts")
    .update({ status: "revoked" })
    .eq("id", accountId)
    .eq("account_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: deleteTokensError } = await supabase
    .from("provider_tokens")
    .delete()
    .eq("provider_account_id", accountId);

  if (deleteTokensError) {
    return NextResponse.json({ error: deleteTokensError.message }, { status: 500 });
  }

  await supabase
    .from("send_identities")
    .update({ provider_account_id: null })
    .eq("provider_account_id", accountId)
    .eq("account_id", user.id);

  return NextResponse.json({ ok: true });
}

