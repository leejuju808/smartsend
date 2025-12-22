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
    const now = new Date().toISOString();

    // Get upcoming appointments with lead information
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(
        `
        id,
        scheduled_for,
        source,
        notes,
        leads:lead_id (
          id,
          name,
          email,
          city,
          first_name,
          last_name
        )
      `
      )
      .gte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (error) {
      console.error("Error fetching upcoming appointments:", error);
      return NextResponse.json(
        { error: "Failed to fetch appointments" },
        { status: 500 }
      );
    }

    return NextResponse.json({ appointments: appointments || [] });
  } catch (error) {
    console.error("Error in upcoming appointments API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}










































