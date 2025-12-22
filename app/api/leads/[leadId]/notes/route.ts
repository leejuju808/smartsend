import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  body: z.string().min(1),
  title: z.string().optional(),
  noteType: z.enum(["note", "call"]).optional().default("note"),
  isInternal: z.boolean().optional(),
});

type LeadNoteRow = {
  id: string;
  created_at: string;
  updated_at: string;
  lead_id: string;
  campaign_id?: string;
  author_id?: string;
  user_id?: string;
  body: string;
  title?: string | null;
  note_type?: string;
  is_internal?: boolean;
  lead_pins?: Array<{ lead_id: string; note_id: string }>;
};

export async function GET(_req: Request, { params }: { params: { leadId: string } }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*, lead_pins(lead_id, note_id)")
    .eq("lead_id", params.leadId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = (data as LeadNoteRow[] | null)?.map(({ lead_pins, ...note }) => ({
    ...note,
    is_pinned: Array.isArray(lead_pins) && lead_pins.length > 0,
  }));

  return NextResponse.json(response ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient();
  const leadId = params.leadId;

  let payload: { body: string; title?: string; noteType?: "note" | "call" };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = payloadSchema.safeParse(payload);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.errors },
      { status: 400 }
    );
  }

  const { body, title, noteType } = parseResult.data;

  if (!body || typeof body !== "string") {
    return NextResponse.json(
      { error: "Note body is required" },
      { status: 400 }
    );
  }

  const resolvedType: "note" | "call" = noteType === "call" ? "call" : "note";

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Insert directly into lead_notes table
  const { data, error } = await supabase
    .from("lead_notes")
    .insert({
      lead_id: leadId,
      body: body.trim(),
      title: title?.trim() || null,
      note_type: resolvedType,
      author_id: user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error inserting lead note:", error);
    return NextResponse.json(
      { error: "Failed to save note", details: error.message },
      { status: 500 }
    );
  }

  // Log event for timeline (Block 11200)
  try {
    await supabase.rpc("log_lead_event", {
      p_lead_id: leadId,
      p_type: "note_added",
      p_content: `Roofer added note: ${body.trim().substring(0, 100)}${body.trim().length > 100 ? "..." : ""}`,
      p_metadata: {
        note_text: body.trim(),
        note_id: data?.id,
        note_type: resolvedType,
      },
    });
  } catch (eventError) {
    // Don't fail the request if event logging fails
    console.error("Error logging note event:", eventError);
  }

  return NextResponse.json(data, { status: 201 });
}

