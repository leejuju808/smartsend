import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/org";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data } = await supabase
      .from("org_billing")
      .select("*")
      .eq("org_id", org.id)
      .maybeSingle();

    return NextResponse.json(data || {});
  } catch (error: any) {
    console.error("Billing fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch billing" }, { status: 500 });
  }
}

