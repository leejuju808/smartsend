import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const sb = createClient();
  const { searchParams } = new URL(req.url);
  const emailId = searchParams.get("emailId");
  
  if (!emailId) {
    return NextResponse.json({ error: "emailId required" }, { status: 400 });
  }

  const { data, error } = await sb.from("meeting_suggestions")
    .select("*")
    .eq("email_id", emailId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}















