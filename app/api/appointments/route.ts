import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");

    let query = supabase
      .from("appointments")
      .select("*")
      .order("scheduled_for", { ascending: true });

    // Filter by lead_id if provided
    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    const { data: appointments, error } = await query;

    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to fetch appointments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ appointments: appointments || [] });
  } catch (error) {
    console.error("Error in appointments API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}










































