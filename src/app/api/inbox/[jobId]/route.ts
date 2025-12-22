import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createBrowserClient } from "@supabase/ssr";

export async function GET(_: NextRequest, { params }: { params: { jobId: string }}) {
  const cookieStore = cookies();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k)=>cookieStore.get(k)?.value } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: thread }, { data: header }] = await Promise.all([
    supabase.from("email_replies")
      .select("*")
      .eq("user_id", user.id)
      .eq("job_id", params.jobId)
      .order("created_at", { ascending: true }),
    supabase.from("email_jobs")
      .select("to_email,subject,campaign_id")
      .eq("id", params.jobId)
      .maybeSingle()
  ]);
  return NextResponse.json({ thread: thread || [], header });
}