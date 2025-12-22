import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { status } = await req.json(); // 'new' | 'confirmed' | 'completed' | 'canceled' | 'no_show'

  const { error } = await supabase
    .from("lead_meetings")
    .update({ status })
    .eq("id", params.id);

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ ok: true }, { status: 200 });
}







