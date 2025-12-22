import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: () => cookieStore }
    );

    // Fetch published case studies (public endpoint)
    const { data: caseStudies, error } = await supabase
      .from("case_studies")
      .select("*")
      .eq("published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching case studies:", error);
      return NextResponse.json(
        { error: "Failed to fetch case studies" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      case_studies: caseStudies || [],
    });
  } catch (error: any) {
    console.error("Case studies API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

