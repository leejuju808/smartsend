// app/api/billing/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Billing/me error:", error);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  // Default to starter if no subscription yet
  return NextResponse.json(
    data || { plan: "starter", status: "active" },
    { status: 200 }
  );
}

























































