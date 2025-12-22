import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({});
  }

  const { data: accs } = await supabase
    .from("calendar_accounts")
    .select("provider,email")
    .eq("user_id", user.id);

  const { data: sync } = await supabase
    .from("calendar_sync_state")
    .select("provider,last_synced_at")
    .eq("user_id", user.id);

  const syncMap = new Map(
    (sync || []).map((row) => [row.provider, row.last_synced_at])
  );

  const out: Record<
    string,
    { email: string | null; last_synced_at?: string | null }
  > = {};
  (accs || []).forEach((a) => {
    out[a.provider] = {
      email: a.email,
      last_synced_at: syncMap.get(a.provider) ?? null,
    };
  });

  return NextResponse.json(out);
}

