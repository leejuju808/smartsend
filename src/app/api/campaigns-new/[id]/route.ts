// app/api/campaigns/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = ctx.params.id;

  const { data: camp, error: cerr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (cerr) return NextResponse.json({ error: cerr.message }, { status: 404 });

  const { data: msgs, error: merr } = await supabase
    .from("campaign_messages")
    .select("*")
    .eq("campaign_id", id)
    .order("position", { ascending: true });
  if (merr) return NextResponse.json({ error: merr.message }, { status: 400 });

  return NextResponse.json({ data: { campaign: camp, messages: msgs } });
}