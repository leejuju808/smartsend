import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const months = Number(url.searchParams.get("months") || 6);

    // Validate months parameter
    if (isNaN(months) || months < 1 || months > 24) {
      return NextResponse.json(
        { error: "Invalid months parameter (must be 1-24)" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("revenue_summary", {
      p_months: months,
    });

    if (error) {
      console.error("Revenue summary error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Unexpected error in revenue summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










































