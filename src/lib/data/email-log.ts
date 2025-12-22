import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getEmailLog(logId: string) {
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
  const { data, error } = await sb
    .from("send_logs")
    .select("id, sent_at, provider_message_id, provider_url, subject_rendered, html_rendered, headers")
    .eq("id", logId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

