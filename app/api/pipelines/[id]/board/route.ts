// app/api/pipelines/[id]/board/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const pipelineId = params.id;

  // Verify user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch stages for the pipeline
  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });

  if (stagesError) {
    return NextResponse.json({ error: stagesError.message }, { status: 400 });
  }

  if (!stages || stages.length === 0) {
    return NextResponse.json({ stages: [], items: [] });
  }

  const stageIds = stages.map((s) => s.id);

  // Fetch contacts in each stage
  const { data: items, error: itemsError } = await supabase
    .from("contact_pipeline")
    .select(`
      id,
      stage_id,
      contact:contacts(
        id,
        name,
        first_name,
        last_name,
        company,
        email,
        phone,
        lead_status
      )
    `)
    .in("stage_id", stageIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 400 });
  }

  // Format contact name
  const formattedItems = (items || []).map((item: any) => {
    const contact = item.contact;
    if (contact) {
      contact.name =
        contact.name ||
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        "No name";
    }
    return item;
  });

  return NextResponse.json({
    stages: stages || [],
    items: formattedItems || [],
  });
}



























































