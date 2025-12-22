import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Params = {
  params: { id: string };
};

type RequestBody = {
  provider_account_id?: string | null;
};

export async function PATCH(req: Request, { params }: Params) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const identityId = params.id;
  if (!identityId) {
    return NextResponse.json({ error: "Missing identity id" }, { status: 400 });
  }

  const payload = (await req.json().catch(() => ({}))) as RequestBody;
  const targetAccountId = payload.provider_account_id ?? null;

  if (targetAccountId) {
    const { data: providerAccount, error: providerError } = await supabase
      .from("provider_accounts")
      .select("id, provider")
      .eq("id", targetAccountId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (providerError) {
      return NextResponse.json({ error: providerError.message }, { status: 500 });
    }

    if (!providerAccount) {
      return NextResponse.json({ error: "Provider account not found" }, { status: 404 });
    }

    const { data: identity, error: identityFetchError } = await supabase
      .from("send_identities")
      .select("provider")
      .eq("id", identityId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (identityFetchError) {
      return NextResponse.json({ error: identityFetchError.message }, { status: 500 });
    }

    if (!identity) {
      return NextResponse.json({ error: "Identity not found" }, { status: 404 });
    }

    if (identity.provider !== providerAccount.provider) {
      return NextResponse.json(
        { error: "Identity provider mismatch" },
        { status: 400 }
      );
    }
  }

  const { error: updateError } = await supabase
    .from("send_identities")
    .update({ provider_account_id: targetAccountId })
    .eq("id", identityId)
    .eq("account_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

