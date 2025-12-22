import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function logAction(workspaceId: string, userEmail: string, action: string, meta: Record<string, any> = {}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: () => cookieStore }
  );

  await supabase.from("activity_log").insert({
    workspace_id: workspaceId,
    user_email: userEmail,
    action,
    meta,
  });
}