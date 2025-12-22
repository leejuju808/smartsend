import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = await params;
  const leadId = id;
  const body = await req.json();
  const { text } = body;

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Note text required" }, { status: 400 });
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, company_id, contact_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Ensure we have company_id and contact_id
    if (!lead.company_id || !lead.contact_id) {
      return NextResponse.json(
        { error: "Lead missing company_id or contact_id" },
        { status: 400 }
      );
    }

    const { error: noteError } = await supabase.from("lead_notes").insert({
      company_id: lead.company_id,
      lead_id: lead.id,
      contact_id: lead.contact_id,
      author_user_id: user.id,
      body: text.trim(),
    });

    if (noteError) throw noteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to add note" },
      { status: 500 }
    );
  }
}
