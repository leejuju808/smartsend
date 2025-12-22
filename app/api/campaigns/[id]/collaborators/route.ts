import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaign_collaborators_view")
    .select("*")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ collaborators: data }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { userId, role } = await req.json(); // role: 'viewer' | 'editor'

  const { error } = await supabase.from("campaign_collaborators").insert({
    campaign_id: params.id,
    user_id: userId,
    role,
  });

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 200 });
}








