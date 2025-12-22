import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("inbox_messages")
    .select("id, direction, from_email, to_email, subject, body_text, body_html, ai_label, created_at, provider")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return new Response(error.message, { status: 400 });
  return new Response(JSON.stringify({ items: data || [] }), { headers: { "content-type": "application/json" } });
}

