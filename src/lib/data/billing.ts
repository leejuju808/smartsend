import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getBilling(teamId: string) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const [{ data: bc }, { data: usage }] = await Promise.all([
    sb.from("billing_customers").select("*").eq("team_id", teamId).maybeSingle(),
    sb.from("v_usage_month").select("*").eq("team_id", teamId).order("month", { ascending: false })
  ]);

  return { bc, usage: usage ?? [] };
}

