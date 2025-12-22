import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function GET(_req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (key: string) => cookieStore.get(key)?.value } }
  );

  const { data, error } = await supabase
    .from("send_queue")
    .select("id, status, step_no, run_at")
    .order("run_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data ?? [] });
}





