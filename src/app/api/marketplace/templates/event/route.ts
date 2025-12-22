import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const body = await req.json();
  const { template_id, event_type } = body;
  
  if (!template_id || !event_type) {
    return NextResponse.json({ error: "Missing template_id or event_type" }, { status: 400 });
  }
  
  if (!['view', 'install', 'copy', 'export'].includes(event_type)) {
    return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
  }

  try {
    const { error } = await sb.from("template_events").insert({
      template_id,
      user_id: user.id,
      event_type
    });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}