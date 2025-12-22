import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { leadId } = params;

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  // Update lead status to "Handled" (try both capitalized and lowercase)
  const { error } = await supabase
    .from("leads")
    .update({ status: "Handled" })
    .eq("id", leadId);

  if (error) {
    // Try lowercase if capitalized doesn't work
    const { error: altError } = await supabase
      .from("leads")
      .update({ status: "handled" })
      .eq("id", leadId);

    if (altError) {
      return NextResponse.json({ error: altError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

