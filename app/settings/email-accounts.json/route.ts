import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ accounts: [], identities: [] }, { status: 401 });
  }

  const [{ data: accounts, error: accountsError }, { data: identities, error: identitiesError }] =
    await Promise.all([
      supabase
        .from("provider_accounts")
        .select(
          `
            id,
            provider,
            email,
            status,
            display_name,
            created_at,
            updated_at,
            provider_tokens!provider_account_id (
              expires_at,
              scope,
              token_type
            )
          `
        )
        .eq("account_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("send_identities")
        .select(
          `
            id,
            email,
            provider,
            is_active,
            provider_account_id,
            daily_limit,
            warmup_enabled,
            warmup_stage
          `
        )
        .eq("account_id", user.id)
        .order("email", { ascending: true }),
    ]);

  if (accountsError || identitiesError) {
    return NextResponse.json(
      {
        accounts: [],
        identities: [],
        error: accountsError?.message ?? identitiesError?.message ?? "Failed to load provider data",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accounts: (accounts ?? []).map((account) => {
      const tokens = Array.isArray(account.provider_tokens)
        ? account.provider_tokens[0]
        : account.provider_tokens;

      return {
        id: account.id,
        provider: account.provider,
        email: account.email,
        status: account.status,
        display_name: account.display_name,
        created_at: account.created_at,
        updated_at: account.updated_at,
        token_expires_at: tokens?.expires_at ?? null,
        token_scope: tokens?.scope ?? null,
        token_type: tokens?.token_type ?? null,
      };
    }),
    identities: identities ?? [],
  });
}