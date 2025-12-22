import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { name, subject, body, weight, isDefault } = await req.json();

  const patch: any = {};
  if (name !== undefined) patch.name = name;
  if (subject !== undefined) patch.subject = subject;
  if (body !== undefined) patch.body = body;
  if (weight !== undefined) patch.weight = weight;
  if (isDefault !== undefined) patch.is_default = isDefault;

  const { error } = await supabase
    .from("sequence_step_variants")
    .update(patch)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 200 });
}

