import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({}, { status: 200 });

  const { data, error } = await supabase
    .from("roi_full_dashboard")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("roi dashboard error:", error);
    return NextResponse.json({}, { status: 200 });
  }

  return NextResponse.json(data);
}














































