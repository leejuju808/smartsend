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

  const { status } = await req.json(); // 'open'|'snoozed'|'closed'

  const { data: thr, error: terr } = await supabase
    .from("inbox_threads").select("id,campaign_id").eq("id", params.id).single();
  if (terr || !thr) return NextResponse.json({ error: terr?.message || "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("inbox_threads").update({ status }).eq("id", thr.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("audit_logs").insert({
    campaign_id: thr.campaign_id,
    action: 'share.update',
    meta: { thread_status: status },
    thread_id: thr.id
  });

  return NextResponse.json({ ok: true });
}
