import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

  const { data: me } = await supabase.auth.getUser();
  const meId = me?.user?.id || null;
  let { user_id } = await req.json(); // uuid or null for unassign

  if (user_id === "me") user_id = meId;

  // Fetch thread to get campaign_id for RLS context
  const { data: thr, error: terr } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,assigned_to")
    .eq("id", params.id).single();
  if (terr || !thr) return NextResponse.json({ error: terr?.message || "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("inbox_threads")
    .update({ assigned_to: user_id })
    .eq("id", thr.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Log
  await supabase.from("audit_logs").insert({
    campaign_id: thr.campaign_id,
    action: 'share.update',
    meta: user_id ? { assign: true, assigned_to: user_id } : { unassign: true },
    thread_id: thr.id
  });

  return NextResponse.json({ ok: true });
}
