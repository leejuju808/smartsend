// app/api/focus-list/route.ts
// Block 21582: Hot Jobs Focus List API Route
// Returns prioritized list of jobs that need action today

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json([], { status: 200 });
  }

  // Query the hot_jobs_focus_list view
  // RLS on leads table ensures we only see rows for user's workspace(s)
  const { data, error } = await supabase
    .from("hot_jobs_focus_list")
    .select("*")
    .order("priority_rank", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Focus list error:", error);
    return NextResponse.json([], { status: 200 });
  }

  return NextResponse.json(data || []);
}














































