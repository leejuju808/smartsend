import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("send_jobs")
    .select("id,to_email,subject,status,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // map to what your dashboard expects
  const jobs = (data ?? []).map(j => ({
    id: j.id,
    to: j.to_email,
    subject: j.subject,
    status: j.status,
    createdAt: j.created_at
  }));
  return NextResponse.json({ jobs });
}