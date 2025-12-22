import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

type SupabaseLike = Pick<SupabaseClient, "from">;

export async function loadVendorSecrets(
  accountId: string,
  vendorKey: string,
  client?: SupabaseLike,
) {
  const supabase = client ?? createServiceClient();

  const { data, error } = await supabase
    .from("vendor_secrets")
    .select("kv")
    .eq("account_id", accountId)
    .eq("vendor_key", vendorKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return {};
  }

  return ((data?.kv as Record<string, string>) ?? {}) as Record<string, string>;
}

function createServiceClient(): SupabaseClient {
  const factory = (globalThis as any).supabaseService as (() => SupabaseClient) | undefined;
  if (factory) return factory();

  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    return createClient(url, key, { auth: { persistSession: false } });
  }

  if (typeof Deno !== "undefined" && typeof Deno.env?.get === "function") {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
    if (url && key) {
      return createClient(url, key, { auth: { persistSession: false } });
    }
  }

  throw new Error("Supabase service client not configured");
}

