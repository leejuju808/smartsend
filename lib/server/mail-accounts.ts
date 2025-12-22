import "server-only";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

export type MailAccount = {
  id: string;
  email: string;
  provider: "gmail" | "outlook";
  status: "active" | "revoked" | "error";
  display_name: string | null;
  created_at: string;
  updated_at: string;
  provider_user_id: string | null;
  tenant_id: string | null;
  token_expires_at: string | null;
};

export async function fetchMailAccounts(): Promise<MailAccount[]> {
  const supabase = createServerComponentClient({ cookies });

  const {
    data,
    error,
  } = await supabase
    .from("provider_accounts")
    .select(
      `
        id,
        email,
        provider,
        status,
        display_name,
        created_at,
        updated_at,
        provider_user_id,
        tenant_id,
        provider_tokens!provider_account_id (
          expires_at
        )
      `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMailAccounts error", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    email: row.email,
    provider: row.provider,
    status: row.status,
    display_name: row.display_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    provider_user_id: row.provider_user_id ?? null,
    tenant_id: row.tenant_id ?? null,
    token_expires_at: Array.isArray(row.provider_tokens)
      ? row.provider_tokens[0]?.expires_at ?? null
      : row.provider_tokens?.expires_at ?? null,
  }));
}