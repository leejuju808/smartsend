import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const demoNoteSchema = z.object({
  // Line 1: Company Snapshot
  // Format: "City, State — X crews, Y–Z jobs/mo, primary service"
  company_snapshot: z.string().min(1),
  
  // Line 2: Pain Points (Top 2–3, comma-separated)
  pain_points: z.string().min(1),
  
  // Line 3: Buying Signal Score (1-5)
  buying_signal_score: z.number().int().min(1).max(5),
  
  // Line 4: Activation Blocker
  activation_blocker: z.string().min(1),
  
  // Optional tags
  tags: z.object({
    interest_level: z.enum(['hot_lead', 'warm_lead', 'not_ready']).optional(),
    service_type: z.enum(['roof_repair', 'roof_replace', 'storm_damage', 'gutters', 'solar_roof']).optional(),
    ideal_plan_target: z.enum(['starter_fit', 'growth_fit', 'domination_fit']).optional(),
  }).optional(),
  
  // Optional metadata
  metadata: z.record(z.any()).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient();
  
  const { data: demoNote, error } = await supabase
    .from("demo_notes")
    .select(`
      *,
      demo_note_tags (*)
    `)
    .eq("lead_id", params.leadId)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(demoNote);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient();
  const leadId = params.leadId;

  let payload: z.infer<typeof demoNoteSchema>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = demoNoteSchema.safeParse(payload);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.errors },
      { status: 400 }
    );
  }

  const { company_snapshot, pain_points, buying_signal_score, activation_blocker, tags, metadata } = parseResult.data;

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Get lead to verify access and get workspace_id
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: "Lead not found" },
      { status: 404 }
    );
  }

  // Verify user has access to this workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", lead.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No access to this workspace" },
      { status: 403 }
    );
  }

  // Insert or update demo note (upsert based on lead_id uniqueness)
  const { data: demoNote, error: noteError } = await supabase
    .from("demo_notes")
    .upsert({
      lead_id: leadId,
      workspace_id: lead.workspace_id,
      created_by: user.id,
      company_snapshot: company_snapshot.trim(),
      pain_points: pain_points.trim(),
      buying_signal_score,
      activation_blocker: activation_blocker.trim(),
      metadata: metadata || {},
    }, {
      onConflict: 'lead_id',
    })
    .select()
    .single();

  if (noteError) {
    console.error("Error inserting demo note:", noteError);
    return NextResponse.json(
      { error: "Failed to save demo note", details: noteError.message },
      { status: 500 }
    );
  }

  // Insert or update tags if provided
  if (tags && demoNote) {
    const { error: tagError } = await supabase
      .from("demo_note_tags")
      .upsert({
        demo_note_id: demoNote.id,
        interest_level: tags.interest_level || null,
        service_type: tags.service_type || null,
        ideal_plan_target: tags.ideal_plan_target || null,
      }, {
        onConflict: 'demo_note_id',
      });

    if (tagError) {
      console.error("Error inserting demo note tags:", tagError);
      // Don't fail the request, just log the error
    }
  }

  // Log event for timeline
  try {
    await supabase.rpc("log_lead_event", {
      p_lead_id: leadId,
      p_type: "demo_note_added",
      p_content: `Demo note added: ${company_snapshot.substring(0, 50)}... (Score: ${buying_signal_score}/5)`,
      p_metadata: {
        demo_note_id: demoNote.id,
        buying_signal_score,
        company_snapshot,
      },
    });
  } catch (eventError) {
    // Don't fail the request if event logging fails
    console.error("Error logging demo note event:", eventError);
  }

  // Fetch the complete demo note with tags
  const { data: completeDemoNote, error: fetchError } = await supabase
    .from("demo_notes")
    .select(`
      *,
      demo_note_tags (*)
    `)
    .eq("id", demoNote.id)
    .single();

  if (fetchError) {
    return NextResponse.json(demoNote, { status: 201 });
  }

  return NextResponse.json(completeDemoNote, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  // PUT is same as POST (upsert)
  return POST(req, { params });
}






































