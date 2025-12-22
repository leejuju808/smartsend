import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // First check if template exists and user owns it
  const { data: existing, error: fetchError } = await supabase
    .from("templates")
    .select("created_by")
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (existing.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, category, body: templateBody, shared } = body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (category !== undefined) updateData.category = category || null;
  if (templateBody !== undefined) updateData.body = templateBody.trim();
  if (shared !== undefined) updateData.shared = shared;

  const { data, error } = await supabase
    .from("templates")
    .update(updateData)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating template:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: data });
}










