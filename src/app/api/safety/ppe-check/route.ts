import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/safety/ppe-check - Create a PPE check
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const {
      job_id,
      date,
      hard_hat,
      harness,
      boots,
      vest,
      goggles,
      gloves,
      notes,
    } = await req.json();

    if (!date) {
      return NextResponse.json(
        { error: "Missing required field: date" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("ppe_checks")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        user_id: user.id,
        date,
        hard_hat: hard_hat || false,
        harness: harness || false,
        boots: boots || false,
        vest: vest || false,
        goggles: goggles || false,
        gloves: gloves || false,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating PPE check:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if any PPE is missing and send alert
    const allPPE = [hard_hat, harness, boots, vest, goggles, gloves];
    const missingPPE = allPPE.filter((item) => !item).length;

    if (missingPPE > 0) {
      // In a real implementation, you'd send an alert to the owner here
      // For now, we'll just log it
      console.log(`PPE check incomplete: ${missingPPE} items missing`);
    }

    return NextResponse.json({ ok: true, data, missingItems: missingPPE });
  } catch (error: any) {
    console.error("Error in POST /api/safety/ppe-check:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/ppe-check - Get PPE checks
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const date = searchParams.get("date");

    let query = supabase
      .from("ppe_checks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (date) {
      query = query.eq("date", date);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching PPE checks:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/ppe-check:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























