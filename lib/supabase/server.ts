import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: any) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    },
  );
}

/**
 * Create a Supabase client with service role key (bypasses RLS)
 * Use only in server-side code, never expose to client
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type SupabaseServerClient = ReturnType<typeof createClient>;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Get a Supabase server client for authenticated requests
 */
export function getSupabaseServerClient(): SupabaseServerClient {
  return createClient();
}

/**
 * Require user authentication and resolve their account.
 * Throws HttpError if user is not authenticated or has no active account.
 */
export async function requireUserAndAccount(
  supabase: SupabaseServerClient
): Promise<{ user: { id: string }; account: { id: string } }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new HttpError(500, authError.message);
  }

  if (!user) {
    throw new HttpError(401, "Unauthorized");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new HttpError(400, membershipError.message);
  }

  const accountId = membership?.account_id ?? null;
  if (!accountId) {
    throw new HttpError(404, "No active account");
  }

  // Set account context for RLS policies
  await supabase.rpc("set_account", { p_account_id: accountId });

  return {
    user: { id: user.id },
    account: { id: accountId },
  };
}

