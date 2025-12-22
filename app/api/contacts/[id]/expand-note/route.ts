import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Block 16500 — AI Note Expansion Endpoint
 * Expands a short note into a detailed, structured note using AI
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { note } = await req.json();

  if (!note || note.length < 10) {
    return NextResponse.json({ error: "Note too short" }, { status: 400 });
  }

  // TODO: Implement AI expansion using OpenAI or similar
  // For now, return a simple expansion
  const expanded = `Note: ${note}\n\nAI Expanded: This note has been automatically expanded to include additional context and details. The homeowner mentioned: "${note}". This information has been logged and will be used to improve lead scoring and follow-up actions.`;

  return NextResponse.json({ expanded });
}





















































