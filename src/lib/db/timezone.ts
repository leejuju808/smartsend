import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns offset in minutes at 'now' for the given IANA timezone using Postgres.
 * Falls back to 0 for invalid TZ.
 */
export async function currentTzOffsetMinutes(tz: string | null | undefined): Promise<number> {
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
  const zone = tz && tz.trim().length > 0 ? tz : "Etc/UTC";
  // Postgres trick: AT TIME ZONE to get local time, then figure offset vs UTC
  const { data, error } = await sb.rpc("get_tz_offset_minutes", { tz_name: zone });
  if (error || typeof data !== "number") return 0;
  return data as number;
}

