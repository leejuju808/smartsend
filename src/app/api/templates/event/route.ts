import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  const body = await req.json();
  const { template_id, event_type } = body;
  
  if (!template_id || !event_type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  
  if (!['view', 'install', 'copy', 'export'].includes(event_type)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const { error } = await supabase.from("template_events").insert({ 
    template_id, 
    user_id: user?.id || null, 
    event_type 
  });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
} 