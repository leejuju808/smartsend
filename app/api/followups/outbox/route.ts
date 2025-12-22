import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data, error } = await supabase
    .from("followup_outbox")
    .select("id,lead_id,sequence_id,step_id,scheduled_for,status,reason")
    .gte("scheduled_for", since)
    .order("scheduled_for", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}




