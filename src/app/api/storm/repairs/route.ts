// Block 40210 — Emergency Repairs API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { storm_lead_id, crew_id, repair_type, eta_hours } = await req.json();

    if (!storm_lead_id) {
      return NextResponse.json(
        { error: "storm_lead_id is required" },
        { status: 400 }
      );
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/schedule-emergency-repair`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          storm_lead_id,
          crew_id,
          repair_type,
          eta_hours,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge function error: ${error}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/storm/repairs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { repair_id, action, notes, photos } = await req.json();

    if (!repair_id || !action) {
      return NextResponse.json(
        { error: "repair_id and action are required" },
        { status: 400 }
      );
    }

    if (action === "complete") {
      // Call complete function
      const { error: completeError } = await supabase.rpc(
        "complete_emergency_repair",
        {
          p_repair_id: repair_id,
          p_notes: notes || null,
          p_photos: photos || "[]"::jsonb,
        }
      );

      if (completeError) {
        throw completeError;
      }

      return NextResponse.json({ ok: true });
    } else if (action === "assign_crew") {
      const { crew_id, eta } = await req.json();

      if (!crew_id) {
        return NextResponse.json(
          { error: "crew_id is required for assign_crew" },
          { status: 400 }
        );
      }

      const { error: assignError } = await supabase.rpc("assign_crew_to_repair", {
        p_repair_id: repair_id,
        p_crew_id: crew_id,
        p_eta: eta || null,
      });

      if (assignError) {
        throw assignError;
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Error in PATCH /api/storm/repairs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































