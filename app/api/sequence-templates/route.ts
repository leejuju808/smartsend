import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/sequence-templates - Get available sequence templates
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category"); // Optional filter by category

  let query = supabase
    .from("sequence_templates")
    .select("*")
    .or(`is_system.eq.true,created_by.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data: templates, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch templates", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ templates: templates || [] });
}

// POST /api/sequence-templates - Create a custom template
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, category, steps } = body;

  if (!name || !steps || !Array.isArray(steps)) {
    return NextResponse.json(
      { error: "name and steps (array) are required" },
      { status: 400 }
    );
  }

  const { data: template, error } = await supabase
    .from("sequence_templates")
    .insert({
      name,
      description,
      category,
      steps,
      is_system: false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create template", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ template }, { status: 201 });
}
















































