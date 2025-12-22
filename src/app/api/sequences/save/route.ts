import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveOrgId } from "@/lib/org";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { name, steps } = await req.json();

    if (!name || !steps || !Array.isArray(steps)) {
      return NextResponse.json(
        { error: "name and steps array required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org_id = getActiveOrgId();
    if (!org_id) {
      return NextResponse.json(
        { error: "No active organization" },
        { status: 400 }
      );
    }

    // Create sequence
    const { data: seq, error: seqError } = await supabase
      .from("sequences")
      .insert({ org_id, name })
      .select("id")
      .single();

    if (seqError || !seq) {
      return NextResponse.json(
        { error: seqError?.message || "Failed to create sequence" },
        { status: 500 }
      );
    }

    // Insert steps
    const stepInserts = steps.map((s: any) => ({
      sequence_id: seq.id,
      step_number: s.step_number || 1,
      wait_days: s.wait_days || 2,
      subject_template: s.subject_template || "",
      body_md: s.body_md || "",
    }));

    const { error: stepsError } = await supabase
      .from("sequence_steps")
      .insert(stepInserts);

    if (stepsError) {
      // Rollback sequence if steps fail
      await supabase.from("sequences").delete().eq("id", seq.id);
      return NextResponse.json(
        { error: stepsError.message || "Failed to create steps" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, sequence_id: seq.id });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
